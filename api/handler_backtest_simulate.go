package api

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"nofx/kernel"
	"nofx/market"
	"nofx/mcp"
	"nofx/store"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// AI Walk-Forward Simulation
// ============================================================================

// SimulateRequest is the JSON body for POST /api/backtest/simulate.
// Symbol, Timeframe, and risk params are derived from Config when not explicitly set.
type SimulateRequest struct {
	Config store.StrategyConfig `json:"config"`

	// Simulation window controls
	Bars         int `json:"bars"`          // total historical bars to fetch (default 300, max 1000)
	StepBars     int `json:"step_bars"`     // bars between AI calls (default auto)
	LookbackBars int `json:"lookback_bars"` // bars fed to AI as context window (default 60)

	// Execution costs (override config risk params when non-zero)
	InitialEquity float64 `json:"initial_equity"`
	SpreadPips    float64 `json:"spread_pips"`
	CommissionUSD float64 `json:"commission_usd"`
	SlippagePips  float64 `json:"slippage_pips"`
	RunMonteCarlo bool    `json:"run_monte_carlo"`
	MonteCarloRuns int    `json:"monte_carlo_runs"`

	// AI model to use
	AIModelID    string `json:"ai_model_id"`
	MT5BridgeURL string `json:"mt5_bridge_url,omitempty"`
}

// SimulateStep is a single AI decision window logged for debugging
type SimulateStep struct {
	BarIndex    int         `json:"bar_index"`
	Time        string      `json:"time"`
	Price       float64     `json:"price"`
	Signal      *SignalInfo `json:"signal,omitempty"`
	AIReasoning string      `json:"ai_reasoning,omitempty"`
	DurationMs  int64       `json:"duration_ms"`
}

type SignalInfo struct {
	Side       string  `json:"side"`
	EntryPrice float64 `json:"entry_price"`
	StopLoss   float64 `json:"stop_loss"`
	TakeProfit float64 `json:"take_profit"`
	Confidence int     `json:"confidence"`
}

// SimulateResult wraps the backtest result with simulation metadata
type SimulateResult struct {
	kernel.BacktestResult
	Steps                []SimulateStep `json:"steps"`
	AICallCount          int            `json:"ai_call_count"`
	TotalSignals         int            `json:"total_signals"`
	SkippedLowConfidence int            `json:"skipped_low_confidence"`
	UsedFallback         bool           `json:"used_fallback"` // true when AI produced no signals and EMA was used
	Symbol               string         `json:"symbol"`
	Timeframe            string         `json:"timeframe"`
}

// handleBacktestSimulate runs a walk-forward AI simulation using the strategy config.
func (s *Server) handleBacktestSimulate(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req SimulateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	cfg := &req.Config

	// ── Derive symbols from strategy config ──────────────────────────────────
	var symbols []string
	switch cfg.CoinSource.SourceType {
	case "forex":
		symbols = cfg.CoinSource.ForexPairs
	case "static":
		symbols = cfg.CoinSource.StaticCoins
	default:
		// For ai500/oi_top/etc., use a small default crypto set — live ranking
		// not available for historical simulation
		symbols = []string{"BTCUSD", "ETHUSD"}
	}
	if len(symbols) == 0 {
		symbols = []string{"EURUSD"}
	}
	// Simulate one symbol at a time; use the first for now (most common strategy pattern)
	sym := strings.ToUpper(symbols[0])

	// ── Derive timeframe from strategy config ────────────────────────────────
	timeframe := cfg.Indicators.Klines.PrimaryTimeframe
	if timeframe == "" {
		timeframe = "1h"
	}

	// ── Simulation defaults ──────────────────────────────────────────────────
	if req.Bars <= 0 {
		req.Bars = 300
	}
	if req.Bars > 1000 {
		req.Bars = 1000
	}
	if req.LookbackBars <= 0 {
		// Use strategy's configured kline count as the lookback window
		req.LookbackBars = cfg.Indicators.Klines.PrimaryCount
		if req.LookbackBars < 30 {
			req.LookbackBars = 60
		}
	}
	if req.StepBars <= 0 {
		req.StepBars = req.LookbackBars / 3
		if req.StepBars < 5 {
			req.StepBars = 5
		}
	}
	// Cap: max 25 AI calls to keep cost/time reasonable
	minStep := req.Bars / 25
	if req.StepBars < minStep {
		req.StepBars = minStep
	}
	if req.InitialEquity <= 0 {
		req.InitialEquity = 10000
	}
	if req.MonteCarloRuns <= 0 {
		req.MonteCarloRuns = 500
	}

	// ── Risk params: strategy config is the source of truth ─────────────────
	riskPct := cfg.RiskControl.RiskPctPerTrade
	if riskPct <= 0 {
		riskPct = 0.0025 // 0.25% default
	}
	isCent := cfg.RiskControl.IsCentAccount

	// ── Resolve AI model ─────────────────────────────────────────────────────
	if req.AIModelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ai_model_id is required"})
		return
	}
	model, err := s.store.AIModel().Get(userID, req.AIModelID)
	if err != nil || !model.Enabled || model.APIKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "AI model not found, disabled, or missing API key"})
		return
	}
	aiClient := mcp.NewAIClientByProvider(model.Provider)
	if aiClient == nil {
		aiClient = mcp.NewClient()
	}
	switch model.Provider {
	case "claw402":
		aiClient.SetAPIKey(string(model.APIKey), "", model.CustomModelName)
	default:
		aiClient.SetAPIKey(string(model.APIKey), model.CustomAPIURL, model.CustomModelName)
	}

	// ── Resolve MT5 bridge URL ────────────────────────────────────────────────
	mt5URL := strings.TrimRight(req.MT5BridgeURL, "/")
	if mt5URL == "" && (market.IsForexSymbol(sym) || cfg.CoinSource.SourceType == "forex") {
		exchanges, _ := s.store.Exchange().List(userID)
		for _, ex := range exchanges {
			if ex.ExchangeType == "mt5" && ex.Enabled && ex.MT5BridgeURL != "" {
				mt5URL = strings.TrimRight(ex.MT5BridgeURL, "/")
				break
			}
		}
	}

	// ── Fetch historical bars ─────────────────────────────────────────────────
	var klines []market.Kline
	if mt5URL != "" && market.IsForexSymbol(sym) {
		klines, err = market.GetKlinesFromMT5BridgeForBacktest(mt5URL, sym, timeframe, req.Bars)
	} else {
		klines, err = market.GetKlinesForBacktest(sym, timeframe, req.Bars)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch historical data: " + err.Error()})
		return
	}
	if len(klines) < req.LookbackBars+req.StepBars {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("not enough bars (%d); need ≥ %d", len(klines), req.LookbackBars+req.StepBars)})
		return
	}

	bars := make([]kernel.BacktestBar, len(klines))
	for i, k := range klines {
		bars[i] = kernel.BacktestBar{
			Time:   time.UnixMilli(k.OpenTime),
			Open:   k.Open, High: k.High, Low: k.Low, Close: k.Close, Volume: k.Volume,
		}
	}

	// ── Walk-forward simulation ───────────────────────────────────────────────
	engine := kernel.NewStrategyEngine(cfg)
	if mt5URL != "" {
		engine.SetMT5BridgeURL(mt5URL)
	}

	minConfidence := cfg.RiskControl.MinConfidence
	if minConfidence <= 0 {
		minConfidence = 60
	}

	var signals []kernel.BacktestSignal
	var steps []SimulateStep
	aiCallCount := 0
	skipped := 0
	equity := req.InitialEquity
	if isCent {
		equity *= 100
	}

	for i := req.LookbackBars; i < len(bars); i += req.StepBars {
		windowKlines := klines[i-req.LookbackBars : i]

		// Provide a longer context slice for the "4h" perspective
		longerStart := i - req.LookbackBars*4
		if longerStart < 0 {
			longerStart = 0
		}
		var longerKlines []market.Kline
		if longerStart < i-req.LookbackBars {
			longerKlines = klines[longerStart : i-req.LookbackBars]
		}

		marketData, dataErr := market.BuildDataFromKlines(sym, windowKlines, longerKlines)
		if dataErr != nil {
			continue
		}

		ctx := &kernel.Context{
			CurrentTime:    bars[i].Time.UTC().Format("2006-01-02 15:04:05 UTC"),
			CallCount:      aiCallCount + 1,
			Account: kernel.AccountInfo{
				TotalEquity:      equity,
				AvailableBalance: equity,
			},
			Positions:      []kernel.PositionInfo{},
			CandidateCoins: []kernel.CandidateCoin{{Symbol: sym}},
			MarketDataMap:  map[string]*market.Data{sym: marketData},
		}

		systemPrompt := engine.BuildSystemPrompt(equity, "balanced")
		userPrompt := engine.BuildUserPrompt(ctx)

		start := time.Now()
		aiResp, callErr := aiClient.CallWithMessages(systemPrompt, userPrompt)
		durMs := time.Since(start).Milliseconds()
		aiCallCount++

		step := SimulateStep{
			BarIndex:   i,
			Time:       bars[i].Time.UTC().Format(time.RFC3339),
			Price:      bars[i].Close,
			DurationMs: durMs,
		}

		if callErr != nil {
			steps = append(steps, step)
			continue
		}

		decisions := extractDecisionsFromResponse(aiResp)
		for _, d := range decisions {
			if d.Confidence < minConfidence {
				skipped++
				continue
			}
			side := ""
			switch strings.ToLower(d.Action) {
			case "open_long":
				side = "long"
			case "open_short":
				side = "short"
			default:
				continue
			}

			entryPrice := bars[i].Close
			sl, tp := d.StopLoss, d.TakeProfit
			if sl == 0 || tp == 0 {
				atr := estimateATR(bars, i, 14)
				slDist := math.Max(atr*1.5, kernel.PipSize(sym)*20)
				if side == "long" {
					sl = entryPrice - slDist
					tp = entryPrice + slDist*2
				} else {
					sl = entryPrice + slDist
					tp = entryPrice - slDist*2
				}
			}

			signals = append(signals, kernel.BacktestSignal{
				Time: bars[i].Time, Symbol: sym, Side: side,
				EntryPrice: entryPrice, StopLoss: sl, TakeProfit: tp,
			})
			step.Signal = &SignalInfo{
				Side: side, EntryPrice: entryPrice,
				StopLoss: sl, TakeProfit: tp, Confidence: d.Confidence,
			}
			step.AIReasoning = truncate(d.Reasoning, 200)
			break // one signal per step
		}
		steps = append(steps, step)
	}

	// Fallback: if AI produced no signals, use EMA crossover so result is never empty
	usedFallback := false
	if len(signals) == 0 {
		signals = kernel.GenerateSimpleSignals(sym, bars, riskPct)
		usedFallback = true
	}

	btCfg := kernel.BacktestConfig{
		Symbol:          sym,
		InitialEquity:   req.InitialEquity,
		IsCentAccount:   isCent,
		RiskPctPerTrade: riskPct,
		SpreadPips:      req.SpreadPips,
		CommissionUSD:   req.CommissionUSD,
		SlippagePips:    req.SlippagePips,
		RunMonteCarlo:   req.RunMonteCarlo,
		MonteCarloRuns:  req.MonteCarloRuns,
	}

	btResult := kernel.RunBacktest(btCfg, signals, bars)

	result := SimulateResult{
		BacktestResult:       btResult,
		Steps:                steps,
		AICallCount:          aiCallCount,
		TotalSignals:         len(signals),
		SkippedLowConfidence: skipped,
		UsedFallback:         usedFallback,
		Symbol:               sym,
		Timeframe:            timeframe,
	}

	c.JSON(http.StatusOK, result)
}

// handleBacktestSimulateRoute is the gin handler.
func (s *Server) handleBacktestSimulateRoute(c *gin.Context) {
	s.handleBacktestSimulate(c)
}

// ── helpers ──────────────────────────────────────────────────────────────────

// extractDecisionsFromResponse parses the AI response for a JSON decision array.
func extractDecisionsFromResponse(resp string) []kernel.Decision {
	// Look for JSON array in response
	start := strings.Index(resp, "[")
	end := strings.LastIndex(resp, "]")
	if start < 0 || end <= start {
		return nil
	}
	jsonStr := resp[start : end+1]
	var raw []struct {
		Symbol    string  `json:"symbol"`
		Action    string  `json:"action"`
		StopLoss  float64 `json:"stop_loss"`
		TakeProfit float64 `json:"take_profit"`
		Confidence int    `json:"confidence"`
		Reasoning string  `json:"reasoning"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &raw); err != nil {
		return nil
	}
	out := make([]kernel.Decision, 0, len(raw))
	for _, r := range raw {
		out = append(out, kernel.Decision{
			Symbol:     r.Symbol,
			Action:     r.Action,
			StopLoss:   r.StopLoss,
			TakeProfit: r.TakeProfit,
			Confidence: r.Confidence,
			Reasoning:  r.Reasoning,
		})
	}
	return out
}

// estimateATR computes a simple ATR from bars ending at index i.
func estimateATR(bars []kernel.BacktestBar, i, period int) float64 {
	start := i - period
	if start < 1 {
		start = 1
	}
	sum := 0.0
	n := 0
	for j := start; j <= i && j < len(bars); j++ {
		h := bars[j].High
		l := bars[j].Low
		pc := bars[j-1].Close
		tr := h - l
		if h-pc > tr {
			tr = h - pc
		}
		if pc-l > tr {
			tr = pc - l
		}
		sum += tr
		n++
	}
	if n == 0 {
		return 0
	}
	return sum / float64(n)
}

func truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max]) + "…"
}
