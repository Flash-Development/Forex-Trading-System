package kernel

import (
	"math"
	"strings"
	"time"
)

// ============================================================================
// Forex Constants & Pair Metadata
// ============================================================================

// Major forex pairs supported for trading.
var ForexMajorPairs = []string{
	"EURUSD", "GBPUSD", "USDJPY", "USDHF",
	"AUDUSD", "USDAD", "NZDUSD",
}

// Minor / cross pairs.
var ForexMinorPairs = []string{
	"EURGBP", "EURJPY", "GBPJPY", "AUDJPY",
	"CADJPY", "CHFJPY", "EURCHF", "EURAUD",
	"EURCAD", "GBPAUD", "GBPCAD", "GBPCHF",
	"AUDCAD", "AUDCHF", "AUDNZD", "NZDCAD",
	"NZDCHF", "NZDJPY",
}

// Metals and commodities traded via MT5.
var ForexCommodities = []string{
	"XAUUSD", "XAGUSD", "XPTUSD",
	"USOIL", "UKOIL",
}

// AllForexPairs is the union of all supported pairs.
var AllForexPairs = append(append(append([]string{}, ForexMajorPairs...), ForexMinorPairs...), ForexCommodities...)

// BrokerMinLot is the smallest tradeable lot size accepted by the broker.
const BrokerMinLot = 0.01

// ============================================================================
// Pip Value Calculation
// ============================================================================

// PipSize returns the pip size for a given forex symbol.
// JPY pairs use 0.01; metals/commodities use 0.01; all others use 0.0001.
func PipSize(symbol string) float64 {
	sym := strings.ToUpper(strings.TrimSuffix(strings.TrimSuffix(symbol, "c"), "m"))
	switch {
	case strings.HasSuffix(sym, "JPY"):
		return 0.01
	case sym == "XAUUSD":
		return 0.01
	case sym == "XAGUSD":
		return 0.001
	case sym == "XPTUSD":
		return 0.01
	case sym == "USOIL" || sym == "UKOIL":
		return 0.01
	default:
		return 0.0001
	}
}

// approximate USD conversion rates for non-USD quote currencies.
// Used only when a live price isn't available for the quote currency pair.
var approxUSDRates = map[string]float64{
	"GBP": 1.27,
	"EUR": 1.09,
	"AUD": 0.65,
	"NZD": 0.60,
	"CAD": 0.74,
	"CHF": 1.12,
}

// quoteToUSD returns approximately how many USD one unit of the quote currency is worth.
func quoteToUSD(quoteCurrency string) float64 {
	if r, ok := approxUSDRates[quoteCurrency]; ok {
		return r
	}
	return 1.0 // fallback: assume 1:1
}

// PipValuePerLot returns the USD value of one pip for one standard lot (100,000 units).
// Handles all major categories:
//   - USD-quoted pairs (EURUSD, GBPUSD, AUDUSD, NZDUSD): pip × lotSize
//   - JPY-quoted pairs (USDJPY, EURJPY, GBPJPY, etc.): pip × lotSize / price
//   - USD-base pairs (USDCHF, USDCAD, USDJPY): pip / price × lotSize
//   - Cross pairs (EURGBP, GBPCHF, AUDCAD, etc.): pip × lotSize × quoteToUSD(quote)
//   - Metals: fixed contract sizes
//
// currentPrice is the current market price of the pair (used for JPY and USD-base conversion).
func PipValuePerLot(symbol string, currentPrice float64) float64 {
	sym := strings.ToUpper(strings.TrimSuffix(strings.TrimSuffix(symbol, "c"), "m"))
	pip := PipSize(sym)
	lotSize := 100_000.0

	switch {
	case sym == "XAUUSD":
		return pip * 100 // gold: 100 oz per lot
	case sym == "XAGUSD":
		return pip * 5000 // silver: 5000 oz per lot
	case sym == "XPTUSD":
		return pip * 50 // platinum: 50 oz per lot
	case sym == "USOIL" || sym == "UKOIL":
		return pip * 1000 // oil: 1000 barrels per lot

	case strings.HasSuffix(sym, "JPY"):
		// All JPY-quoted pairs: pip value in JPY, convert to USD via current price
		if currentPrice <= 0 {
			currentPrice = 150.0
		}
		return (pip * lotSize) / currentPrice

	case strings.HasPrefix(sym, "USD") && len(sym) == 6:
		// USD is the base currency (USDCHF, USDCAD, USDJPY already caught above)
		// pip value = pip / price × lotSize (in quote currency), then convert to USD
		// Since USD is base, 1 pip move = pip/price lots of quote → divide by price
		if currentPrice <= 0 {
			return pip * lotSize
		}
		// quote currency is sym[3:6]
		quoteCcy := sym[3:6]
		if quoteCcy == "JPY" {
			// already handled above, but guard
			return (pip * lotSize) / currentPrice
		}
		// For USDCHF: pip value in CHF = pip × lotSize; convert CHF→USD = / price
		return (pip * lotSize) / currentPrice

	case strings.HasSuffix(sym, "USD") && len(sym) == 6:
		// USD is the quote currency (EURUSD, GBPUSD, AUDUSD, NZDUSD)
		// 1 pip = $10 per standard lot regardless of price
		return pip * lotSize

	default:
		// Cross pairs: neither base nor quote is USD (EURGBP, GBPCHF, AUDCAD, etc.)
		// pip value is in the quote currency; approximate conversion to USD
		if len(sym) >= 6 {
			quoteCcy := sym[3:6]
			return pip * lotSize * quoteToUSD(quoteCcy)
		}
		return pip * lotSize
	}
}

// ============================================================================
// Percentage-Based Position Sizing
// ============================================================================

// ForexPositionSizeRequest holds all inputs needed to calculate a forex lot size.
type ForexPositionSizeRequest struct {
	Symbol        string  // e.g. "EURUSD"
	AccountEquity float64 // effective USD equity (already cent-normalised if applicable)
	RiskPct       float64 // fraction of equity to risk, e.g. 0.0025 = 0.25% (used when RiskUSD == 0)
	RiskUSD       float64 // fixed dollar risk per trade (takes precedence over RiskPct when > 0)
	StopLossPips  float64 // distance from entry to stop loss in pips
	CurrentPrice  float64 // current market price (for pip-value conversion)
}

// ForexPositionSizeResult contains the calculated lot size and supporting metrics.
type ForexPositionSizeResult struct {
	Lots          float64 // standard lots to trade
	RiskUSD       float64 // dollar amount at risk
	PipValuePerLot float64 // USD value of 1 pip per standard lot
	PipValue      float64 // USD value of 1 pip for the calculated lot size
}

// CalculateForexPositionSize computes the lot size using the standard forex
// risk-management formula:
//
//	lots = riskUSD / (stopLossPips × pipValuePerLot)
//
// riskUSD is taken directly from req.RiskUSD when > 0, otherwise computed as
// req.RiskPct × req.AccountEquity.
// The result is rounded down to 2 decimal places (0.01 lot precision).
func CalculateForexPositionSize(req ForexPositionSizeRequest) ForexPositionSizeResult {
	if req.StopLossPips <= 0 {
		return ForexPositionSizeResult{}
	}

	// Determine risk in USD: fixed amount takes precedence over percentage.
	var riskUSD float64
	switch {
	case req.RiskUSD > 0:
		riskUSD = req.RiskUSD
	case req.RiskPct > 0 && req.AccountEquity > 0:
		riskUSD = req.RiskPct * req.AccountEquity
	default:
		return ForexPositionSizeResult{}
	}

	pipVal := PipValuePerLot(req.Symbol, req.CurrentPrice)
	if pipVal <= 0 {
		return ForexPositionSizeResult{}
	}

	rawLots := riskUSD / (req.StopLossPips * pipVal)

	// Round down to 0.01 lot precision
	lots := math.Floor(rawLots*100) / 100
	if lots < BrokerMinLot {
		return ForexPositionSizeResult{}
	}

	return ForexPositionSizeResult{
		Lots:           lots,
		RiskUSD:        riskUSD,
		PipValuePerLot: pipVal,
		PipValue:       lots * pipVal,
	}
}

// NormaliseCentAccountEquity converts a cent-account raw balance to its
// standard USD equivalent for risk and sizing calculations.
// A $10 cent-account balance represents 1000 US cents = $10 real money,
// but the broker quotes it as 1000 "cents", so we multiply by 100 to get
// the standard-lot-equivalent USD value ($1000) used internally.
func NormaliseCentAccountEquity(rawBalance float64, isCentAccount bool) float64 {
	if isCentAccount {
		return rawBalance * 100
	}
	return rawBalance
}

// ============================================================================
// Session Awareness
// ============================================================================

// ForexSession represents a named trading session.
type ForexSession string

const (
	SessionTokyo         ForexSession = "tokyo"
	SessionLondon        ForexSession = "london"
	SessionNewYork       ForexSession = "new_york"
	SessionSydney        ForexSession = "sydney"
	SessionLondonNYOverlap ForexSession = "london_ny_overlap"
)

// SessionWindow defines the UTC open/close hours for a session.
type SessionWindow struct {
	OpenHour  int
	CloseHour int
}

var sessionWindows = map[ForexSession]SessionWindow{
	SessionSydney:          {OpenHour: 21, CloseHour: 6},  // 21:00–06:00 UTC
	SessionTokyo:           {OpenHour: 0, CloseHour: 9},   // 00:00–09:00 UTC
	SessionLondon:          {OpenHour: 7, CloseHour: 16},  // 07:00–16:00 UTC
	SessionNewYork:         {OpenHour: 12, CloseHour: 21}, // 12:00–21:00 UTC
	SessionLondonNYOverlap: {OpenHour: 12, CloseHour: 16}, // 12:00–16:00 UTC
}

// IsSessionActive returns true if the given session is currently active (UTC).
func IsSessionActive(session ForexSession, t time.Time) bool {
	utc := t.UTC()
	h := utc.Hour()
	w, ok := sessionWindows[session]
	if !ok {
		return false
	}
	if w.OpenHour < w.CloseHour {
		return h >= w.OpenHour && h < w.CloseHour
	}
	// Wraps midnight (e.g. Sydney 21:00–06:00)
	return h >= w.OpenHour || h < w.CloseHour
}

// IsAllowedSession returns true if at least one of the allowed sessions is
// currently active, or if allowedSessions is empty (trade all sessions).
func IsAllowedSession(allowedSessions []string, t time.Time) bool {
	if len(allowedSessions) == 0 {
		return true
	}
	for _, s := range allowedSessions {
		if IsSessionActive(ForexSession(s), t) {
			return true
		}
	}
	return false
}
