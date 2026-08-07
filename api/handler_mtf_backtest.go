package api

import (
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
// Multi-Timeframe Backtest Handler
// ============================================================================

// MTFBacktestRequest is the body for POST /api/backtest/mtf
type MTFBacktestRequest struct {
	Config store.StrategyConfig `json:"config"`

	Symbol        string  `json:"symbol"`         // e.g. "EURUSD" — overrides config if set
	Variant       string  `json:"variant"`        // "conservative" | "balanced" | "aggressive"
	Bars          int     `json:"bars"`           // M5 bars to fetch (default 500, max 2000)
	ContextBars   int     `json:"context_bars"`   // bars per TF fed to AI (default 50)
	InitialEquity float64 `json:"initial_equity"` // virtual portfolio start balance
	SpreadPips    float64 `json:"spread_pips"`
	CommissionUSD float64 `json:"commission_usd"`
	SlippagePips  float64 `json:"slippage_pips"`
	RunMonteCarlo bool    `json:"run_monte_carlo"`
	MonteCarloRuns int    `json:"monte_carlo_runs"`

	// AIModelID — if provided, use AI for signal generation.
	// If empty, fall back to rule-based EMA crossover + MTF alignment filter.
	AIModelID    string `json:"ai_model_id,omitempty"`
	MT5BridgeURL string `json:"mt5_bridge_url,omitempty"`
}

// MTFImproveRequest is the body for POST /api/backtest/mtf/improve
type MTFImproveRequest struct {
	Result    kernel.MTFBacktestResult `json:"result"`
	Config    store.StrategyConfig     `json:"config"`
	AIModelID string                   `json:"ai_model_id"`
}

// MTFImproveResponse is returned by the improve endpoint.
type MTFImproveResponse struct {
	Analysis        string               `json:"analysis"`
	Suggestions     []string             `json:"suggestions"`
	ImprovedConfig  *store.StrategyConfig `json:"improved_config,omitempty"`
	DurationMs      int64                `json:"duration_ms"`
}

// handleMTFBacktest runs the multi-timeframe walk-forward backtest.
func (s *Server) handleMTFBacktest(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req MTFBacktestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	// ── Defaults ──────────────────────────────────────────────────────────────
	if req.Bars <= 0 {
		req.Bars = 500
	}
	if req.Bars > 2000 {
		req.Bars = 2000
	}
	if req.ContextBars <= 0 {
		req.ContextBars = 50
	}
	if req.InitialEquity <= 0 {
		req.InitialEquity = 10000
	}
	if req.Variant == "" {
		req.Variant = "balanced"
	}
	if req.MonteCarloRuns <= 0 {
		req.MonteCarloRuns = 500
	}

	// ── Resolve symbol ────────────────────────────────────────────────────────
	sym := strings.ToUpper(req.Symbol)
	if sym == "" {
		switch req.Config.CoinSource.SourceType {
		case "forex":
			if len(req.Config.CoinSource.ForexPairs) > 0 {
				sym = req.Config.CoinSource.ForexPairs[0]
			}
		case "static":
			if len(req.Config.CoinSource.StaticCoins) > 0 {
				sym = req.Config.CoinSource.StaticCoins[0]
			}
		}
		if sym == "" {
			sym = "EURUSD"
		}
	}

	// ── Resolve MT5 bridge URL ────────────────────────────────────────────────
	mt5URL := strings.TrimRight(req.MT5BridgeURL, "/")
	if mt5URL == "" && market.IsForexSymbol(sym) {
		exchanges, _ := s.store.Exchange().List(userID)
		for _, ex := range exchanges {
			if ex.ExchangeType == "mt5" && ex.Enabled && ex.MT5BridgeURL != "" {
				mt5URL = strings.TrimRight(ex.MT5BridgeURL, "/")
				break
			}
		}
	}

	// ── Fetch historical klines for all 4 TFs ─────────────────────────────────
	// Each TF needs enough bars to cover the full simulation period.
	// M5 bar count drives the time window; other TFs get proportionally fewer bars.
	tfBarCounts := map[string]int{
		"5m":  req.Bars,
		"15m": req.Bars / 3,
		"1h":  req.Bars / 12,
		"4h":  req.Bars / 48,
	}
	for tf, cnt := range tfBarCounts {
		if cnt < req.ContextBars*2 {
			tfBarCounts[tf] = req.ContextBars * 2
		}
	}

	store := make(kernel.MTFKlineStore)
	for _, tf := range kernel.MTFTimeframes {
		limit := tfBarCounts[tf]
		var klines []market.Kline
		var err error
		if mt5URL != "" && market.IsForexSymbol(sym) {
			klines, err = market.GetKlinesFromMT5BridgeForBacktest(mt5URL, sym, tf, limit)
		} else {
			klines, err = market.GetKlinesForBacktest(sym, tf, limit)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("failed to fetch %s klines: %v", tf, err),
			})
			return
		}
		store[tf] = klines
	}

	m5Klines := store["5m"]
	if len(m5Klines) < req.ContextBars+5 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("not enough M5 bars (%d); need ≥ %d", len(m5Klines), req.ContextBars+5),
		})
		return
	}

	// Convert M5 klines → BacktestBars for the execution engine
	m5Bars := make([]kernel.BacktestBar, len(m5Klines))
	for i, k := range m5Klines {
		m5Bars[i] = kernel.BacktestBar{
			Time: time.UnixMilli(k.OpenTime),
			Open: k.Open, High: k.High, Low: k.Low, Close: k.Close, Volume: k.Volume,
		}
	}

	// ── Resolve AI model (optional) ───────────────────────────────────────────
	var aiClient mcp.AIClient
	if req.AIModelID != "" {
		model, err := s.store.AIModel().Get(userID, req.AIModelID)
		if err == nil && model.Enabled && model.APIKey != "" {
			aiClient = mcp.NewAIClientByProvider(model.Provider)
			if aiClient == nil {
				aiClient = mcp.NewClient()
			}
			switch model.Provider {
			case "claw402":
				aiClient.SetAPIKey(string(model.APIKey), "", model.CustomModelName)
			default:
				aiClient.SetAPIKey(string(model.APIKey), model.CustomAPIURL, model.CustomModelName)
			}
		}
	}

	// ── Strategy engine for prompt building ───────────────────────────────────
	engine := kernel.NewStrategyEngine(&req.Config)
	if mt5URL != "" {
		engine.SetMT5BridgeURL(mt5URL)
	}

	cfg := req.Config.RiskControl
	riskPct := cfg.RiskPctPerTrade
	if riskPct <= 0 {
		riskPct = 0.01
	}
	isCent := cfg.IsCentAccount

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

	minConf := req.Config.RiskControl.MinConfidence
	if minConf <= 0 {
		minConf = 60
	}

	// ── Walk-forward loop over M5 bars ────────────────────────────────────────
	// Step interval: call AI/rule-engine every N M5 bars.
	// Max 50 AI calls to keep cost reasonable.
	stepBars := (len(m5Bars) - req.ContextBars) / 50
	if stepBars < 5 {
		stepBars = 5
	}

	vp := kernel.NewVirtualPortfolio(req.InitialEquity)
	if isCent {
		vp = kernel.NewVirtualPortfolio(req.InitialEquity * 100)
	}
	vp.EquityCurve = append(vp.EquityCurve, kernel.EquityPoint{
		Time:   m5Bars[0].Time,
		Equity: vp.Equity,
	})

	var signalLog []kernel.MTFStepLog
	var mtfTrades []kernel.MTFTradeResult
	alignStats := kernel.MTFAlignmentStats{}
	aiCallCount := 0
	skippedConf := 0

	for i := req.ContextBars; i < len(m5Bars); i++ {
		// Check exits on every bar
		vp.CheckExits(m5Bars[i], btCfg)

		// Only generate signals at step intervals
		if (i-req.ContextBars)%stepBars != 0 {
			continue
		}

		// Skip if position already open (one position at a time)
		if len(vp.Positions) > 0 {
			continue
		}

		// Build MTF snapshot
		snapshot, tfSlices := kernel.BuildMTFSnapshot(store, sym, i, req.ContextBars)
		if snapshot == nil {
			continue
		}

		// Detect alignment
		mtfSum, alignment := kernel.DetectMTFAlignment(tfSlices)
		alignStats.TotalSteps++
		switch alignment {
		case "full_long":
			alignStats.FullLong++
		case "full_short":
			alignStats.FullShort++
		case "partial_long":
			alignStats.PartialLong++
		case "partial_short":
			alignStats.PartialShort++
		default:
			alignStats.NoSignal++
		}

		step := kernel.MTFStepLog{
			BarIndex:   i,
			Time:       m5Bars[i].Time.UTC().Format(time.RFC3339),
			Price:      m5Bars[i].Close,
			MTFSummary: mtfSum,
			Alignment:  alignment,
		}

		// Determine signal
		var sig *kernel.BacktestSignal
		reasoning := ""
		durMs := int64(0)

		if aiClient != nil && (alignment == "full_long" || alignment == "full_short" || strings.HasPrefix(alignment, "partial")) {
			// AI path: build context and call AI
			ctx := &kernel.Context{
				CurrentTime: m5Bars[i].Time.UTC().Format("2006-01-02 15:04:05 UTC"),
				CallCount:   aiCallCount + 1,
				Account: kernel.AccountInfo{
					TotalEquity:      vp.Equity,
					AvailableBalance: vp.Equity,
				},
				Positions:      []kernel.PositionInfo{},
				CandidateCoins: []kernel.CandidateCoin{{Symbol: sym}},
				MarketDataMap:  map[string]*market.Data{sym: snapshot},
			}

			sysPrompt := engine.BuildSystemPrompt(vp.Equity, req.Variant)
			userPrompt := engine.BuildUserPrompt(ctx)

			t0 := time.Now()
			aiResp, err := aiClient.CallWithMessages(sysPrompt, userPrompt)
			durMs = time.Since(t0).Milliseconds()
			aiCallCount++

			if err == nil {
				decisions := extractDecisionsFromResponse(aiResp)
				for _, d := range decisions {
					if d.Confidence < minConf {
						skippedConf++
						continue
					}
					side := ""
					switch strings.ToLower(d.Action) {
					case "open_long":
						side = "long"
					case "open_short":
						side = "short"
					}
					if side == "" {
						continue
					}

					entryPrice := m5Bars[i].Close
					sl, tp := d.StopLoss, d.TakeProfit
					if sl == 0 || tp == 0 {
						atr := estimateATR(m5Bars, i, 14)
						slDist := math.Max(atr*1.5, kernel.PipSize(sym)*20)
						if side == "long" {
							sl = entryPrice - slDist
							tp = entryPrice + slDist*2
						} else {
							sl = entryPrice + slDist
							tp = entryPrice - slDist*2
						}
					}

					s := kernel.BacktestSignal{
						Time: m5Bars[i].Time, Symbol: sym, Side: side,
						EntryPrice: entryPrice, StopLoss: sl, TakeProfit: tp,
					}
					sig = &s
					reasoning = truncate(d.Reasoning, 250)
					step.Signal = &kernel.MTFSignalInfo{
						Side: side, EntryPrice: entryPrice, StopLoss: sl,
						TakeProfit: tp, Confidence: d.Confidence,
					}
					step.AIReasoning = reasoning
					break
				}
			}
		} else if aiClient == nil {
			// Rule-based path: use MTF alignment directly
			side := ""
			switch alignment {
			case "full_long", "partial_long":
				side = "long"
			case "full_short", "partial_short":
				side = "short"
			}
			if side != "" {
				atr := estimateATR(m5Bars, i, 14)
				slDist := math.Max(atr*1.5, kernel.PipSize(sym)*20)
				entryPrice := m5Bars[i].Close
				sl, tp := 0.0, 0.0
				if side == "long" {
					sl = entryPrice - slDist
					tp = entryPrice + slDist*2
				} else {
					sl = entryPrice + slDist
					tp = entryPrice - slDist*2
				}
				s := kernel.BacktestSignal{
					Time: m5Bars[i].Time, Symbol: sym, Side: side,
					EntryPrice: entryPrice, StopLoss: sl, TakeProfit: tp,
				}
				sig = &s
				reasoning = fmt.Sprintf("MTF alignment: %s (H4: %s, H1: %s, M15: %s, M5: %s)",
					alignment, mtfSum.H4Trend, mtfSum.H1Trend, mtfSum.M15Setup, mtfSum.M5Signal)
				step.Signal = &kernel.MTFSignalInfo{
					Side: side, EntryPrice: entryPrice, StopLoss: sl,
					TakeProfit: tp, Confidence: 70,
				}
				step.AIReasoning = reasoning
			}
		}

		step.DurationMs = durMs
		signalLog = append(signalLog, step)

		// Open position if signal generated
		if sig != nil {
			tradeIdx := len(vp.Trades)
			vp.OpenPosition(*sig, btCfg, m5Bars[i].Time, i)

			// Attach MTF context to this trade (resolved later on close)
			_ = tradeIdx
			mtfTrades = append(mtfTrades, kernel.MTFTradeResult{
				MTFContext:  mtfSum,
				AIReasoning: reasoning,
				Confidence:  func() int {
					if step.Signal != nil {
						return step.Signal.Confidence
					}
					return 0
				}(),
				Variant: req.Variant,
			})
		}
	}

	// Close any remaining open positions at last bar
	if len(m5Bars) > 0 {
		vp.CloseAll(m5Bars[len(m5Bars)-1], btCfg)
	}

	// Merge MTFTrades with actual closed trades
	for i := range mtfTrades {
		if i < len(vp.Trades) {
			mtfTrades[i].BacktestTrade = vp.Trades[i]
		}
	}
	vp.MTFTrades = mtfTrades

	// Build result
	base := vp.BuildResult(btCfg, m5Bars)

	// Monte Carlo
	if req.RunMonteCarlo && len(vp.Trades) > 0 {
		runs := req.MonteCarloRuns
		if runs <= 0 {
			runs = 500
		}
		base.MonteCarloResult = kernel.RunMonteCarlo(vp.Trades, req.InitialEquity, runs)
	}

	result := kernel.MTFBacktestResult{
		BacktestResult: base,
		MTFTrades:      vp.MTFTrades,
		SignalLog:      signalLog,
		AlignmentStats: alignStats,
		Symbol:         sym,
		Variant:        req.Variant,
		AICallCount:    aiCallCount,
	}

	c.JSON(http.StatusOK, result)
}

// handleMTFImprove calls the AI to analyse the backtest result and suggest parameter improvements.
func (s *Server) handleMTFImprove(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req MTFImproveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
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

	r := req.Result
	systemPrompt := `You are an expert quantitative trading strategy optimizer.
Analyze the provided backtest results and suggest concrete parameter improvements.
Respond in JSON with this structure:
{
  "analysis": "<2-3 sentence performance summary>",
  "suggestions": ["<specific change 1>", "<specific change 2>", ...],
  "improved_config_hints": {
    "variant": "<conservative|balanced|aggressive>",
    "risk_pct_per_trade": <float 0.005-0.05>,
    "min_confidence": <int 55-90>,
    "min_risk_reward_ratio": <float 1.5-4.0>,
    "spread_pips_recommendation": <float>
  }
}`

	userPrompt := fmt.Sprintf(`Backtest results for %s (variant: %s):
- Total Return: %.2f%%
- Win Rate: %.1f%%
- Profit Factor: %.2f
- Sharpe Ratio: %.2f
- Max Drawdown: %.2f%%
- Total Trades: %d
- Avg Win Pips: %.1f | Avg Loss Pips: %.1f
- Avg R:R: %.2f
- Expected Value: %.2f%%
- AI Calls: %d
- MTF Alignment — Full Long: %d | Full Short: %d | Partial: %d | No Signal: %d
- Current risk_pct_per_trade: %.3f
- Current min_confidence: %d
- Current variant: %s

Identify the key weaknesses and provide specific, actionable parameter changes to improve performance.`,
		r.Symbol, r.Variant,
		r.TotalReturnPct*100, r.WinRate*100, r.ProfitFactor,
		r.SharpeRatio, r.MaxDrawdownPct*100, r.TotalTrades,
		r.AvgWinPips, r.AvgLossPips, r.AvgRR, r.ExpectedValuePct*100,
		r.AICallCount,
		r.AlignmentStats.FullLong, r.AlignmentStats.FullShort,
		r.AlignmentStats.PartialLong+r.AlignmentStats.PartialShort,
		r.AlignmentStats.NoSignal,
		req.Config.RiskControl.RiskPctPerTrade,
		req.Config.RiskControl.MinConfidence,
		r.Variant,
	)

	t0 := time.Now()
	aiResp, err := aiClient.CallWithMessages(systemPrompt, userPrompt)
	durMs := time.Since(t0).Milliseconds()

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI call failed: " + err.Error()})
		return
	}

	// Try to parse structured response
	improve := MTFImproveResponse{DurationMs: durMs}

	// Extract analysis text and suggestions from the response
	analysis := extractTagContent(aiResp, "analysis")
	if analysis == "" {
		analysis = aiResp[:min(len(aiResp), 400)]
	}
	improve.Analysis = analysis

	// Simple suggestion extraction from JSON or plain text
	improve.Suggestions = extractSuggestions(aiResp)

	c.JSON(http.StatusOK, improve)
}

// extractSuggestions parses an AI response for a list of suggestions.
func extractSuggestions(resp string) []string {
	// Try to find "suggestions" JSON array
	start := strings.Index(resp, `"suggestions"`)
	if start < 0 {
		return []string{truncate(resp, 500)}
	}
	arrStart := strings.Index(resp[start:], "[")
	arrEnd := strings.Index(resp[start:], "]")
	if arrStart < 0 || arrEnd <= arrStart {
		return []string{truncate(resp, 500)}
	}
	raw := resp[start+arrStart : start+arrEnd+1]
	// Parse simple string array
	var items []string
	inStr := false
	cur := strings.Builder{}
	for _, ch := range raw {
		switch {
		case ch == '"' && !inStr:
			inStr = true
		case ch == '"' && inStr:
			if cur.Len() > 0 {
				items = append(items, cur.String())
				cur.Reset()
			}
			inStr = false
		case inStr:
			cur.WriteRune(ch)
		}
	}
	if len(items) == 0 {
		return []string{truncate(resp, 500)}
	}
	return items
}

// handleMTFBacktestRoute is the gin route handler.
func (s *Server) handleMTFBacktestRoute(c *gin.Context) {
	s.handleMTFBacktest(c)
}

func (s *Server) handleMTFImproveRoute(c *gin.Context) {
	s.handleMTFImprove(c)
}
