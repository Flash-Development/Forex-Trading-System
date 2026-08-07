package kernel

import (
	"math"
	"testing"

	"pgregory.net/rapid"
)

// jypSymbolGen generates a random JPY symbol like "XXXJPY" where XXX is 3 uppercase letters.
func jpySymbolGen() *rapid.Generator[string] {
	return rapid.Custom(func(t *rapid.T) string {
		letters := "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
		b := make([]byte, 3)
		for i := range b {
			b[i] = letters[rapid.IntRange(0, len(letters)-1).Draw(t, "letter")]
		}
		return string(b) + "JPY"
	})
}

// nonJPYForexSymbolGen returns one of the well-known non-JPY, non-commodity forex pairs.
func nonJPYForexSymbolGen() *rapid.Generator[string] {
	pairs := []string{
		"EURUSD", "GBPUSD", "AUDUSD", "NZDUSD",
		"USDCHF", "USDCAD", "EURGBP", "EURAUD",
		"EURCAD", "EURCHF", "GBPAUD", "GBPCAD",
		"GBPCHF", "AUDCAD", "AUDCHF", "AUDNZD",
		"NZDCAD", "NZDCHF",
	}
	return rapid.Map(rapid.IntRange(0, len(pairs)-1), func(i int) string {
		return pairs[i]
	})
}

// ============================================================
// Property 2: Lot derivation and floor correctness
// Feature: fixed-risk-per-trade, Property 2: lot derivation and floor correctness
// Validates: Requirements 4.5, 5.1
// ============================================================

func TestProperty2_LotDerivationAndFloorCorrectness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		equity := rapid.Float64Range(100, 1_000_000).Draw(t, "equity")
		slPips := rapid.Float64Range(5, 500).Draw(t, "slPips")
		// Use both a non-JPY and a JPY symbol by picking via a bool
		useJPY := rapid.Bool().Draw(t, "useJPY")

		var symbol string
		var currentPrice float64
		if useJPY {
			symbol = jpySymbolGen().Draw(t, "symbol")
			currentPrice = rapid.Float64Range(100, 160).Draw(t, "currentPrice") // realistic USDJPY range
		} else {
			symbol = nonJPYForexSymbolGen().Draw(t, "symbol")
			currentPrice = rapid.Float64Range(0.5, 2.0).Draw(t, "currentPrice")
		}

		req := ForexPositionSizeRequest{
			Symbol:        symbol,
			AccountEquity: equity,
			RiskPct:       0.0025,
			StopLossPips:  slPips,
			CurrentPrice:  currentPrice,
		}
		res := CalculateForexPositionSize(req)

		pipVal := PipValuePerLot(symbol, currentPrice)
		riskUSD := 0.0025 * equity
		rawLots := riskUSD / (slPips * pipVal)
		floored := math.Floor(rawLots*100) / 100

		if floored < BrokerMinLot {
			// Must return zero lots when below broker minimum
			if res.Lots != 0 {
				t.Fatalf("expected Lots=0 for floored=%v < BrokerMinLot, got Lots=%v", floored, res.Lots)
			}
		} else {
			// Lots must match the floored value
			if res.Lots != floored {
				t.Fatalf("expected Lots=%v (floored), got Lots=%v", floored, res.Lots)
			}
			// Actual risk (lots × slPips × pipVal) must not exceed riskUSD
			actualRisk := res.Lots * slPips * pipVal
			if actualRisk > riskUSD+1e-9 {
				t.Fatalf("actualRisk %v exceeds riskUSD %v", actualRisk, riskUSD)
			}
		}
	})
}

// ============================================================
// Property 1: Risk amount is exactly 0.25% of equity
// Feature: fixed-risk-per-trade, Property 1: risk amount equals equity × 0.0025
// Validates: Requirements 1.2, 1.3
// ============================================================

func TestProperty1_RiskAmountEqualsEquityTimes0025(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		equity := rapid.Float64Range(100, 1_000_000).Draw(t, "equity")
		slPips := rapid.Float64Range(5, 200).Draw(t, "slPips")
		useJPY := rapid.Bool().Draw(t, "useJPY")

		var symbol string
		var currentPrice float64
		if useJPY {
			symbol = jpySymbolGen().Draw(t, "symbol")
			currentPrice = rapid.Float64Range(100, 160).Draw(t, "currentPrice")
		} else {
			symbol = nonJPYForexSymbolGen().Draw(t, "symbol")
			currentPrice = rapid.Float64Range(0.5, 2.0).Draw(t, "currentPrice")
		}

		req := ForexPositionSizeRequest{
			Symbol:        symbol,
			AccountEquity: equity,
			RiskPct:       0.0025,
			StopLossPips:  slPips,
			CurrentPrice:  currentPrice,
		}
		res := CalculateForexPositionSize(req)

		// Only assert when a valid lot size was returned
		if res.Lots <= 0 {
			return
		}

		expectedRiskUSD := equity * 0.0025

		// RiskUSD in result must equal equity × 0.0025 exactly
		if math.Abs(res.RiskUSD-expectedRiskUSD) > 1e-9 {
			t.Fatalf("RiskUSD=%v, want equity×0.0025=%v", res.RiskUSD, expectedRiskUSD)
		}

		// lots × slPips × pipValuePerLot must not exceed riskUSD (floor may reduce slightly)
		pipVal := PipValuePerLot(symbol, currentPrice)
		actualRisk := res.Lots * slPips * pipVal
		if actualRisk > expectedRiskUSD+1e-9 {
			t.Fatalf("lots×slPips×pipVal=%v exceeds riskUSD=%v", actualRisk, expectedRiskUSD)
		}
	})
}

// ============================================================
// TestPipValuePerLot_AllCategories verifies pip values are correct
// for every pair category: USD-quote, JPY, USD-base, cross, metals, oil.
// ============================================================
func TestPipValuePerLot_AllCategories(t *testing.T) {
	tests := []struct {
		symbol   string
		price    float64
		wantPip  float64 // expected pip value per lot in USD (approximate for cross pairs)
		tolerance float64
	}{
		// USD-quoted: 1 pip = $10 exactly
		{"EURUSD", 1.09, 10.0, 0.001},
		{"GBPUSD", 1.27, 10.0, 0.001},
		{"AUDUSD", 0.65, 10.0, 0.001},
		{"NZDUSD", 0.60, 10.0, 0.001},

		// JPY-quoted: pip = 0.01, value = 0.01 × 100000 / price
		{"USDJPY", 150.0, 6.667, 0.01},
		{"EURJPY", 163.0, 6.135, 0.01},
		{"GBPJPY", 191.0, 5.236, 0.01},
		{"AUDJPY", 98.0, 10.204, 0.01},

		// USD-base (USDXXX): pip value = pip × lotSize / price
		{"USDCHF", 0.90, 11.11, 0.1},
		{"USDCAD", 1.36, 7.35, 0.1},

		// Cross pairs: pip value in quote ccy × approx USD rate
		{"EURGBP", 0.85, 12.7, 0.5},  // quote GBP ≈ 1.27 USD → $12.7/pip
		{"EURAUD", 1.68, 6.5, 0.5},   // quote AUD ≈ 0.65 USD → $6.5/pip
		{"GBPCHF", 1.14, 11.2, 0.5},  // quote CHF ≈ 1.12 USD → $11.2/pip
		{"AUDCAD", 0.88, 7.4, 0.5},   // quote CAD ≈ 0.74 USD → $7.4/pip
		{"NZDCHF", 0.51, 11.2, 0.5},  // quote CHF ≈ 1.12 USD → $11.2/pip

		// Metals
		{"XAUUSD", 2300.0, 1.0, 0.001},  // 0.01 pip × 100 oz = $1/pip
		{"XAGUSD", 28.0, 5.0, 0.001},    // 0.001 pip × 5000 oz = $5/pip
		{"XPTUSD", 1000.0, 0.5, 0.001},  // 0.01 pip × 50 oz = $0.5/pip

		// Oil
		{"USOIL", 80.0, 10.0, 0.001}, // 0.01 pip × 1000 bbl = $10/pip
		{"UKOIL", 78.0, 10.0, 0.001},
	}

	for _, tt := range tests {
		t.Run(tt.symbol, func(t *testing.T) {
			got := PipValuePerLot(tt.symbol, tt.price)
			if math.Abs(got-tt.wantPip) > tt.tolerance {
				t.Errorf("%s @ %.4f: got pip value %.4f, want %.4f (±%.3f)",
					tt.symbol, tt.price, got, tt.wantPip, tt.tolerance)
			}
		})
	}
}

// ============================================================
// TestPositionSizing_0007_AllPairs verifies lot sizing at 0.7% risk
// across all pair categories with a $5000 account.
// ============================================================
func TestPositionSizing_0007_AllPairs(t *testing.T) {
	equity := 5000.0
	riskPct := 0.007 // 0.7%
	expectedRiskUSD := equity * riskPct // $35

	tests := []struct {
		symbol  string
		price   float64
		slPips  float64
		minLots float64 // must be at least this many lots
	}{
		{"EURUSD", 1.09, 20, 0.01},
		{"GBPUSD", 1.27, 20, 0.01},
		{"USDJPY", 150.0, 20, 0.01},
		{"EURJPY", 163.0, 20, 0.01},
		{"GBPJPY", 191.0, 20, 0.01},
		{"USDCHF", 0.90, 20, 0.01},
		{"USDCAD", 1.36, 20, 0.01},
		{"EURGBP", 0.85, 20, 0.01},
		{"GBPCHF", 1.14, 20, 0.01},
		{"AUDCAD", 0.88, 20, 0.01},
		{"XAUUSD", 2300.0, 20, 0.01},
		{"USOIL", 80.0, 20, 0.01},
	}

	for _, tt := range tests {
		t.Run(tt.symbol, func(t *testing.T) {
			res := CalculateForexPositionSize(ForexPositionSizeRequest{
				Symbol:        tt.symbol,
				AccountEquity: equity,
				RiskPct:       riskPct,
				StopLossPips:  tt.slPips,
				CurrentPrice:  tt.price,
			})

			if res.Lots < tt.minLots {
				t.Errorf("%s: got %.2f lots, want ≥ %.2f (riskUSD=%.2f, slPips=%.0f)",
					tt.symbol, res.Lots, tt.minLots, expectedRiskUSD, tt.slPips)
			}

			// Actual risk must not exceed expected (floor rounding may be slightly under)
			pipVal := PipValuePerLot(tt.symbol, tt.price)
			actualRisk := res.Lots * tt.slPips * pipVal
			if actualRisk > expectedRiskUSD*1.01 {
				t.Errorf("%s: actual risk $%.2f exceeds expected $%.2f",
					tt.symbol, actualRisk, expectedRiskUSD)
			}
		})
	}
}
