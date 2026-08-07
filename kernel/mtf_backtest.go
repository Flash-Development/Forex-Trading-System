package kernel

import (
	"math"
	"nofx/market"
	"time"
)

// ============================================================================
// Multi-Timeframe Backtest Engine
// ============================================================================
// Core rule: same strategy engine, different execution layer only.
// All trade simulation is virtual — NO broker interaction.

// MTFTimeframes defines the required timeframe stack for MTF analysis.
// H4 = macro trend, H1 = trend structure, M15 = setup zone, M5 = entry trigger.
var MTFTimeframes = []string{"4h", "1h", "15m", "5m"}

// MTFKlineStore holds the full historical kline series for each timeframe.
// Indexed by timeframe string → sorted asc klines.
type MTFKlineStore map[string][]market.Kline

// MTFBarIndex maps M5 bar time (UnixMilli) → index in M5 klines slice.
type MTFBarIndex map[int64]int

// MTFBacktestConfig extends BacktestConfig with MTF-specific settings.
type MTFBacktestConfig struct {
	BacktestConfig

	// Symbol to test — forex (EURUSD) or crypto (BTCUSD).
	Symbol string
	// ContextBars is how many bars of each TF to feed the AI per step.
	ContextBars int
	// VariantOverride overrides the prompt variant (conservative/balanced/aggressive).
	VariantOverride string
}

// MTFSignalContext captures the per-step MTF snapshot fed to the AI.
type MTFSignalContext struct {
	BarTime   time.Time
	Price     float64
	// Klines per timeframe (most recent ContextBars bars up to this step).
	TFKlines  map[string][]market.Kline
}

// MTFSignalInfo mirrors SignalInfo from the api package for kernel-internal use.
type MTFSignalInfo struct {
	Side       string  `json:"side"`
	EntryPrice float64 `json:"entry_price"`
	StopLoss   float64 `json:"stop_loss"`
	TakeProfit float64 `json:"take_profit"`
	Confidence int     `json:"confidence"`
}

// MTFTradeResult extends BacktestTrade with the MTF context that triggered it.
type MTFTradeResult struct {
	BacktestTrade
	MTFContext  MTFSignalSummary `json:"mtf_context"`
	AIReasoning string           `json:"ai_reasoning,omitempty"`
	Confidence  int              `json:"confidence"`
	Variant     string           `json:"variant"`
}

// MTFSignalSummary is a compact per-TF indicator snapshot stored with each trade.
type MTFSignalSummary struct {
	H4Trend  string  `json:"h4_trend"`  // "bullish" | "bearish" | "neutral"
	H1Trend  string  `json:"h1_trend"`
	M15Setup string  `json:"m15_setup"` // "long_setup" | "short_setup" | "no_setup"
	M5Signal string  `json:"m5_signal"` // "long_trigger" | "short_trigger" | "no_trigger"
	H4EMA20  float64 `json:"h4_ema20"`
	H1EMA20  float64 `json:"h1_ema20"`
	M5RSI    float64 `json:"m5_rsi"`
	M5ATR    float64 `json:"m5_atr"`
}

// MTFBacktestResult is the full output of an MTF backtest run.
type MTFBacktestResult struct {
	// Embed standard backtest metrics.
	BacktestResult
	// MTF-specific trades with per-trade AI context.
	MTFTrades []MTFTradeResult `json:"mtf_trades"`
	// Per-step signal log (one entry per M5 bar where AI was called).
	SignalLog []MTFStepLog `json:"signal_log"`
	// Summary of how often each TF alignment fired.
	AlignmentStats MTFAlignmentStats `json:"alignment_stats"`
	// Config echo.
	Symbol   string `json:"symbol"`
	Variant  string `json:"variant"`
	AICallCount int `json:"ai_call_count"`
}

// MTFStepLog is a single walk-forward step log entry.
type MTFStepLog struct {
	BarIndex    int              `json:"bar_index"`
	Time        string           `json:"time"`
	Price       float64          `json:"price"`
	MTFSummary  MTFSignalSummary `json:"mtf_summary"`
	Signal      *MTFSignalInfo   `json:"signal,omitempty"`
	AIReasoning string           `json:"ai_reasoning,omitempty"`
	DurationMs  int64            `json:"duration_ms"`
	Alignment   string           `json:"alignment"` // "full_long"|"full_short"|"partial"|"none"
}

// MTFAlignmentStats tracks how often full 4TF alignment occurred.
type MTFAlignmentStats struct {
	TotalSteps    int `json:"total_steps"`
	FullLong      int `json:"full_long"`
	FullShort     int `json:"full_short"`
	PartialLong   int `json:"partial_long"`
	PartialShort  int `json:"partial_short"`
	NoSignal      int `json:"no_signal"`
}

// ============================================================================
// MTF Snapshot Builder
// ============================================================================

// BuildMTFSnapshot builds a market.Data snapshot from pre-fetched historical klines
// for the MTF context up to (and including) the bar at position `upTo` in the M5 slice.
//
//   store    — full historical klines for all 4 TFs
//   sym      — symbol string
//   m5Idx    — index in the store["5m"] slice that represents "now"
//   ctxBars  — how many recent bars to include per TF
func BuildMTFSnapshot(store MTFKlineStore, sym string, m5Idx, ctxBars int) (*market.Data, map[string][]market.Kline) {
	if ctxBars <= 0 {
		ctxBars = 50
	}

	m5Klines := store["5m"]
	if m5Idx < 0 || m5Idx >= len(m5Klines) {
		return nil, nil
	}

	// Current bar time
	currentMs := m5Klines[m5Idx].OpenTime

	// For each TF: find bars up to currentMs, take last ctxBars
	tfSlices := make(map[string][]market.Kline, len(MTFTimeframes))
	for _, tf := range MTFTimeframes {
		klines, ok := store[tf]
		if !ok || len(klines) == 0 {
			continue
		}
		// Binary-search-like: find last bar whose OpenTime <= currentMs
		end := 0
		for i := len(klines) - 1; i >= 0; i-- {
			if klines[i].OpenTime <= currentMs {
				end = i + 1
				break
			}
		}
		if end == 0 {
			continue
		}
		start := end - ctxBars
		if start < 0 {
			start = 0
		}
		tfSlices[tf] = klines[start:end]
	}

	// Build a market.Data from the M5 primary slice and H4 as longer context
	primary := tfSlices["5m"]
	longer := tfSlices["4h"]
	if len(primary) == 0 {
		return nil, tfSlices
	}

	data, _ := market.BuildDataFromKlines(sym, primary, longer)
	if data == nil {
		// Fallback minimal data
		last := primary[len(primary)-1]
		data = &market.Data{
			Symbol:       sym,
			CurrentPrice: last.Close,
		}
	}

	// Inject TimeframeData for all TFs so the prompt builder sees full MTF context
	if data.TimeframeData == nil {
		data.TimeframeData = make(map[string]*market.TimeframeSeriesData)
	}
	for tf, klines := range tfSlices {
		if len(klines) > 0 {
			disp := 20
			if len(klines) < disp {
				disp = len(klines)
			}
			data.TimeframeData[tf] = market.CalculateTimeframeSeriesExported(klines, tf, disp)
		}
	}

	return data, tfSlices
}

// ============================================================================
// MTF Alignment Detector (rule-based, used as pre-filter + summary)
// ============================================================================

// DetectMTFAlignment analyses the TF kline slices and returns a compact alignment summary.
func DetectMTFAlignment(tfSlices map[string][]market.Kline) (MTFSignalSummary, string) {
	sum := MTFSignalSummary{}

	ema20 := func(ks []market.Kline) float64 {
		if len(ks) < 5 {
			return 0
		}
		closes := make([]float64, len(ks))
		for i, k := range ks {
			closes[i] = k.Close
		}
		p := 20
		if len(closes) < p {
			p = len(closes)
		}
		vals := EMA(closes, p)
		if len(vals) == 0 {
			return 0
		}
		return vals[len(vals)-1]
	}
	rsi := func(ks []market.Kline, p int) float64 {
		if len(ks) < p+1 {
			return 50
		}
		bars := make([]BacktestBar, len(ks))
		for i, k := range ks {
			bars[i] = BacktestBar{Close: k.Close}
		}
		// Simple RSI calculation
		gains, losses := 0.0, 0.0
		for i := 1; i <= p && i < len(bars); i++ {
			d := bars[i].Close - bars[i-1].Close
			if d > 0 {
				gains += d
			} else {
				losses -= d
			}
		}
		if gains+losses == 0 {
			return 50
		}
		avgG := gains / float64(p)
		avgL := losses / float64(p)
		if avgL == 0 {
			return 100
		}
		rs := avgG / avgL
		return 100 - (100 / (1 + rs))
	}
	atr := func(ks []market.Kline) float64 {
		if len(ks) < 2 {
			return 0
		}
		bars := make([]BacktestBar, len(ks))
		for i, k := range ks {
			bars[i] = BacktestBar{High: k.High, Low: k.Low, Close: k.Close}
		}
		vals := ATR(bars, 14)
		return vals[len(vals)-1]
	}

	trend := func(ks []market.Kline) string {
		if len(ks) < 3 {
			return "neutral"
		}
		e := ema20(ks)
		last := ks[len(ks)-1].Close
		if last > e*1.001 {
			return "bullish"
		}
		if last < e*0.999 {
			return "bearish"
		}
		return "neutral"
	}

	if ks, ok := tfSlices["4h"]; ok && len(ks) > 0 {
		sum.H4Trend = trend(ks)
		sum.H4EMA20 = ema20(ks)
	} else {
		sum.H4Trend = "neutral"
	}
	if ks, ok := tfSlices["1h"]; ok && len(ks) > 0 {
		sum.H1Trend = trend(ks)
		sum.H1EMA20 = ema20(ks)
	} else {
		sum.H1Trend = "neutral"
	}
	if ks, ok := tfSlices["15m"]; ok && len(ks) > 0 {
		t := trend(ks)
		switch t {
		case "bullish":
			sum.M15Setup = "long_setup"
		case "bearish":
			sum.M15Setup = "short_setup"
		default:
			sum.M15Setup = "no_setup"
		}
	}
	if ks, ok := tfSlices["5m"]; ok && len(ks) > 0 {
		r := rsi(ks, 7)
		sum.M5RSI = r
		sum.M5ATR = atr(ks)
		if r < 40 && sum.M15Setup == "long_setup" {
			sum.M5Signal = "long_trigger"
		} else if r > 60 && sum.M15Setup == "short_setup" {
			sum.M5Signal = "short_trigger"
		} else {
			sum.M5Signal = "no_trigger"
		}
	}

	// Alignment classification
	bullishTFs := 0
	bearishTFs := 0
	for _, t := range []string{sum.H4Trend, sum.H1Trend} {
		if t == "bullish" {
			bullishTFs++
		} else if t == "bearish" {
			bearishTFs++
		}
	}
	if sum.M15Setup == "long_setup" {
		bullishTFs++
	} else if sum.M15Setup == "short_setup" {
		bearishTFs++
	}
	if sum.M5Signal == "long_trigger" {
		bullishTFs++
	} else if sum.M5Signal == "short_trigger" {
		bearishTFs++
	}

	alignment := "none"
	switch {
	case bullishTFs == 4:
		alignment = "full_long"
	case bearishTFs == 4:
		alignment = "full_short"
	case bullishTFs >= 3:
		alignment = "partial_long"
	case bearishTFs >= 3:
		alignment = "partial_short"
	}
	return sum, alignment
}

// ============================================================================
// Virtual Portfolio
// ============================================================================

// VirtualPosition tracks a simulated open position.
type VirtualPosition struct {
	Symbol     string
	Side       string
	EntryPrice float64
	StopLoss   float64
	TakeProfit float64
	Lots       float64
	EntryTime  time.Time
	EntryBar   int
	RiskUSD    float64
}

// VirtualPortfolio is the in-memory trade ledger for backtesting.
type VirtualPortfolio struct {
	Balance    float64
	Equity     float64
	Peak       float64
	MaxDD      float64
	MaxDDUSD   float64
	Positions  []VirtualPosition
	Trades     []BacktestTrade
	MTFTrades  []MTFTradeResult
	EquityCurve []EquityPoint
}

// NewVirtualPortfolio creates a new virtual portfolio.
func NewVirtualPortfolio(initialBalance float64) *VirtualPortfolio {
	vp := &VirtualPortfolio{
		Balance:  initialBalance,
		Equity:   initialBalance,
		Peak:     initialBalance,
	}
	return vp
}

// OpenPosition opens a virtual trade. Lots = 0 means auto-size from riskPct.
func (vp *VirtualPortfolio) OpenPosition(sig BacktestSignal, cfg BacktestConfig, barTime time.Time, barIdx int) {
	lots := sig.Lots
	if lots <= 0 && cfg.RiskPctPerTrade > 0 {
		slPips := math.Abs(sig.EntryPrice-sig.StopLoss) / PipSize(sig.Symbol)
		if slPips > 0 {
			r := CalculateForexPositionSize(ForexPositionSizeRequest{
				Symbol:        sig.Symbol,
				AccountEquity: vp.Equity,
				RiskPct:       cfg.RiskPctPerTrade,
				StopLossPips:  slPips,
				CurrentPrice:  sig.EntryPrice,
			})
			lots = r.Lots
		}
	}
	if lots <= 0 {
		lots = 0.01
	}

	pip := PipSize(sig.Symbol)
	spreadCost := cfg.SpreadPips * pip
	slipCost := cfg.SlippagePips * pip
	entry := sig.EntryPrice
	if sig.Side == "long" {
		entry += spreadCost + slipCost
	} else {
		entry -= spreadCost + slipCost
	}

	vp.Positions = append(vp.Positions, VirtualPosition{
		Symbol:     sig.Symbol,
		Side:       sig.Side,
		EntryPrice: entry,
		StopLoss:   sig.StopLoss,
		TakeProfit: sig.TakeProfit,
		Lots:       lots,
		EntryTime:  barTime,
		EntryBar:   barIdx,
		RiskUSD:    cfg.RiskPctPerTrade * vp.Equity,
	})
}

// CheckExits evaluates the current bar's H/L against open positions and closes any hit.
func (vp *VirtualPortfolio) CheckExits(bar BacktestBar, cfg BacktestConfig) {
	pip := PipSize(cfg.Symbol)
	slipCost := cfg.SlippagePips * pip

	remaining := vp.Positions[:0]
	for _, pos := range vp.Positions {
		exitPrice := 0.0
		exitTime := bar.Time
		var pips float64

		if pos.Side == "long" {
			if bar.Low <= pos.StopLoss {
				exitPrice = pos.StopLoss - slipCost
			} else if bar.High >= pos.TakeProfit {
				exitPrice = pos.TakeProfit - slipCost
			}
			if exitPrice > 0 {
				pips = (exitPrice - pos.EntryPrice) / pip
			}
		} else {
			if bar.High >= pos.StopLoss {
				exitPrice = pos.StopLoss + slipCost
			} else if bar.Low <= pos.TakeProfit {
				exitPrice = pos.TakeProfit + slipCost
			}
			if exitPrice > 0 {
				pips = (pos.EntryPrice - exitPrice) / pip
			}
		}

		if exitPrice == 0 {
			remaining = append(remaining, pos)
			continue
		}

		// Calculate P&L
		pipVal := PipValuePerLot(pos.Symbol, pos.EntryPrice)
		pnl := pips*pipVal*pos.Lots - cfg.CommissionUSD*pos.Lots*2

		isWin := pnl > 0
		vp.Balance += pnl
		vp.Equity = vp.Balance

		if vp.Equity > vp.Peak {
			vp.Peak = vp.Equity
		}
		dd := (vp.Peak - vp.Equity) / vp.Peak
		if dd > vp.MaxDD {
			vp.MaxDD = dd
			vp.MaxDDUSD = vp.Peak - vp.Equity
		}

		rrDist := math.Abs(pos.TakeProfit - pos.EntryPrice)
		slDist := math.Abs(pos.EntryPrice - pos.StopLoss)
		rr := 0.0
		if slDist > 0 {
			rr = rrDist / slDist
		}

		trade := BacktestTrade{
			Symbol:     pos.Symbol,
			Side:       pos.Side,
			EntryTime:  pos.EntryTime,
			ExitTime:   exitTime,
			EntryPrice: pos.EntryPrice,
			ExitPrice:  exitPrice,
			Lots:       pos.Lots,
			StopLoss:   pos.StopLoss,
			TakeProfit: pos.TakeProfit,
			PnLUSD:     pnl,
			PnLPct:     pnl / vp.Equity,
			RiskUSD:    pos.RiskUSD,
			Pips:       pips,
			IsWin:      isWin,
		}
		_ = rr
		_ = trade // consumed below
		vp.Trades = append(vp.Trades, BacktestTrade{
			Symbol:     pos.Symbol,
			Side:       pos.Side,
			EntryTime:  pos.EntryTime,
			ExitTime:   exitTime,
			EntryPrice: pos.EntryPrice,
			ExitPrice:  exitPrice,
			Lots:       pos.Lots,
			StopLoss:   pos.StopLoss,
			TakeProfit: pos.TakeProfit,
			PnLUSD:     pnl,
			PnLPct:     pnl / (vp.Equity + pnl), // pct of equity at entry
			RiskUSD:    pos.RiskUSD,
			Pips:       pips,
			IsWin:      isWin,
		})
		vp.EquityCurve = append(vp.EquityCurve, EquityPoint{Time: exitTime, Equity: vp.Equity})
	}
	vp.Positions = remaining
}

// CloseAll force-closes all open positions at the last bar's close price.
func (vp *VirtualPortfolio) CloseAll(lastBar BacktestBar, cfg BacktestConfig) {
	pip := PipSize(cfg.Symbol)
	for _, pos := range vp.Positions {
		exitPrice := lastBar.Close
		var pips float64
		if pos.Side == "long" {
			pips = (exitPrice - pos.EntryPrice) / pip
		} else {
			pips = (pos.EntryPrice - exitPrice) / pip
		}
		pipVal := PipValuePerLot(pos.Symbol, pos.EntryPrice)
		pnl := pips * pipVal * pos.Lots

		vp.Balance += pnl
		vp.Equity = vp.Balance
		if vp.Equity > vp.Peak {
			vp.Peak = vp.Equity
		}

		vp.Trades = append(vp.Trades, BacktestTrade{
			Symbol:     pos.Symbol,
			Side:       pos.Side,
			EntryTime:  pos.EntryTime,
			ExitTime:   lastBar.Time,
			EntryPrice: pos.EntryPrice,
			ExitPrice:  exitPrice,
			Lots:       pos.Lots,
			StopLoss:   pos.StopLoss,
			TakeProfit: pos.TakeProfit,
			PnLUSD:     pnl,
			PnLPct:     pnl / (vp.Equity + pnl),
			RiskUSD:    pos.RiskUSD,
			Pips:       pips,
			IsWin:      pnl > 0,
		})
		vp.EquityCurve = append(vp.EquityCurve, EquityPoint{Time: lastBar.Time, Equity: vp.Equity})
	}
	vp.Positions = nil
}

// BuildResult computes final metrics from the virtual portfolio state.
func (vp *VirtualPortfolio) BuildResult(cfg BacktestConfig, bars []BacktestBar) BacktestResult {
	n := len(vp.Trades)
	result := BacktestResult{
		Symbol:         cfg.Symbol,
		InitialEquity:  cfg.InitialEquity,
		FinalEquity:    vp.Equity,
		MaxDrawdownPct: vp.MaxDD,
		MaxDrawdownUSD: vp.MaxDDUSD,
		TotalTrades:    n,
		EquityCurve:    vp.EquityCurve,
		Trades:         vp.Trades,
	}
	if len(bars) > 0 {
		result.StartDate = bars[0].Time
		result.EndDate = bars[len(bars)-1].Time
	}
	if cfg.InitialEquity > 0 {
		result.TotalReturnPct = (vp.Equity - cfg.InitialEquity) / cfg.InitialEquity
	}
	if n > 0 {
		wins, grossProfit, grossLoss := 0, 0.0, 0.0
		sumWinPips, sumLossPips, sumRR := 0.0, 0.0, 0.0
		for _, t := range vp.Trades {
			if t.IsWin {
				wins++
				grossProfit += t.PnLUSD
				sumWinPips += t.Pips
			} else {
				grossLoss += math.Abs(t.PnLUSD)
				sumLossPips += math.Abs(t.Pips)
			}
			slDist := math.Abs(t.EntryPrice - t.StopLoss)
			tpDist := math.Abs(t.TakeProfit - t.EntryPrice)
			if slDist > 0 {
				sumRR += tpDist / slDist
			}
		}
		result.WinRate = float64(wins) / float64(n)
		if grossLoss > 0 {
			result.ProfitFactor = grossProfit / grossLoss
		}
		if wins > 0 {
			result.AvgWinPips = sumWinPips / float64(wins)
		}
		if n-wins > 0 {
			result.AvgLossPips = sumLossPips / float64(n-wins)
		}
		result.AvgRR = sumRR / float64(n)
		result.SharpeRatio = calcSharpe(vp.Trades)
		if result.AvgLossPips > 0 {
			result.ExpectedValuePct = (result.WinRate*result.AvgWinPips - (1-result.WinRate)*result.AvgLossPips) / result.AvgLossPips
		}
	}
	return result
}

// helpers

// mtfMin is a local helper to avoid conflict with engine_analysis.go's min.
func mtfMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}
