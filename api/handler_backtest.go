package api

import (
	"encoding/json"
	"net/http"
	"nofx/kernel"
	"nofx/market"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// writeError writes a JSON error response for plain net/http handlers.
func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ============================================================================
// Backtest API Handler
// ============================================================================

// BacktestRequest is the JSON body for POST /api/backtest
type BacktestRequest struct {
	Symbol          string  `json:"symbol"`
	Timeframe       string  `json:"timeframe"`          // e.g. "1h"
	Bars            int     `json:"bars"`               // number of historical bars
	InitialEquity   float64 `json:"initial_equity"`
	IsCentAccount   bool    `json:"is_cent_account"`
	RiskPctPerTrade float64 `json:"risk_pct_per_trade"` // e.g. 0.01
	SpreadPips      float64 `json:"spread_pips"`
	CommissionUSD   float64 `json:"commission_usd"`
	SlippagePips    float64 `json:"slippage_pips"`
	RunMonteCarlo   bool    `json:"run_monte_carlo"`
	MonteCarloRuns  int     `json:"monte_carlo_runs"`
	// MT5BridgeURL overrides the server-configured MT5 bridge URL for this request.
	// Useful when the user selects a forex symbol but the server has multiple bridge
	// accounts — the frontend can pass the preferred account URL explicitly.
	MT5BridgeURL string `json:"mt5_bridge_url,omitempty"`
	// Signals can be provided directly (for forward-test replay) or generated
	// from a simple rule-based strategy when empty.
	Signals []BacktestSignalDTO `json:"signals,omitempty"`
}

// BacktestSignalDTO is the JSON representation of a trade signal.
type BacktestSignalDTO struct {
	Time       string  `json:"time"`        // RFC3339
	Symbol     string  `json:"symbol"`
	Side       string  `json:"side"`        // "long" | "short"
	EntryPrice float64 `json:"entry_price"`
	StopLoss   float64 `json:"stop_loss"`
	TakeProfit float64 `json:"take_profit"`
	Lots       float64 `json:"lots,omitempty"`
}

// handleBacktest runs a backtest and returns the result.
func (s *Server) handleBacktest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BacktestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	// Defaults
	if req.Symbol == "" {
		req.Symbol = "EURUSD"
	}
	if req.Timeframe == "" {
		req.Timeframe = "1h"
	}
	if req.Bars <= 0 {
		req.Bars = 500
	}
	if req.Bars > 2000 {
		req.Bars = 2000
	}
	if req.InitialEquity <= 0 {
		req.InitialEquity = 10000
	}
	if req.MonteCarloRuns <= 0 {
		req.MonteCarloRuns = 1000
	}

	// Fetch historical bars
	sym := strings.ToUpper(req.Symbol)
	var klines []market.Kline
	var err error

	// If the caller supplied an MT5 bridge URL override, use it directly for forex.
	if req.MT5BridgeURL != "" && market.IsForexSymbol(sym) {
		klines, err = market.GetKlinesFromMT5BridgeForBacktest(req.MT5BridgeURL, sym, req.Timeframe, req.Bars)
	} else {
		klines, err = market.GetKlinesForBacktest(sym, req.Timeframe, req.Bars)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch historical data: "+err.Error())
		return
	}

	bars := make([]kernel.BacktestBar, 0, len(klines))
	for _, k := range klines {
		bars = append(bars, kernel.BacktestBar{
			Time:   time.UnixMilli(k.OpenTime),
			Open:   k.Open,
			High:   k.High,
			Low:    k.Low,
			Close:  k.Close,
			Volume: k.Volume,
		})
	}

	// Convert signals
	signals := make([]kernel.BacktestSignal, 0, len(req.Signals))
	for _, s := range req.Signals {
		t, err := time.Parse(time.RFC3339, s.Time)
		if err != nil {
			continue
		}
		signals = append(signals, kernel.BacktestSignal{
			Time:       t,
			Symbol:     s.Symbol,
			Side:       s.Side,
			EntryPrice: s.EntryPrice,
			StopLoss:   s.StopLoss,
			TakeProfit: s.TakeProfit,
			Lots:       s.Lots,
		})
	}

	// If no signals provided, generate simple EMA crossover signals from bars
	if len(signals) == 0 {
		signals = kernel.GenerateSimpleSignals(sym, bars, req.RiskPctPerTrade)
	}

	cfg := kernel.BacktestConfig{
		Symbol:          sym,
		InitialEquity:   req.InitialEquity,
		IsCentAccount:   req.IsCentAccount,
		RiskPctPerTrade: req.RiskPctPerTrade,
		SpreadPips:      req.SpreadPips,
		CommissionUSD:   req.CommissionUSD,
		SlippagePips:    req.SlippagePips,
		RunMonteCarlo:   req.RunMonteCarlo,
		MonteCarloRuns:  req.MonteCarloRuns,
	}

	result := kernel.RunBacktest(cfg, signals, bars)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleForexPairs returns the list of supported forex pairs grouped by category.
func (s *Server) handleForexPairs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"majors":      kernel.ForexMajorPairs,
		"minors":      kernel.ForexMinorPairs,
		"commodities": kernel.ForexCommodities,
	})
}

// ============================================================================
// Gin-compatible wrappers (server.go uses gin)
// ============================================================================

func (s *Server) handleBacktestProtected(c *gin.Context) {
	s.handleBacktest(c.Writer, c.Request)
}

func (s *Server) handleForexPairsProtected(c *gin.Context) {
	s.handleForexPairs(c.Writer, c.Request)
}
