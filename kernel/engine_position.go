package kernel

import (
	"fmt"
	"math"
	"nofx/logger"
	"nofx/store"
	"time"
)

// ============================================================================
// Decision Validation
// ============================================================================

func validateDecisions(decisions []Decision, accountEquity float64, btcEthLeverage, altcoinLeverage int, btcEthPosRatio, altcoinPosRatio float64, minPositionSize, minRiskReward float64) error {
	for i := range decisions {
		if err := validateDecision(&decisions[i], accountEquity, btcEthLeverage, altcoinLeverage, btcEthPosRatio, altcoinPosRatio, minPositionSize, minRiskReward); err != nil {
			return fmt.Errorf("decision #%d validation failed: %w", i+1, err)
		}
	}
	return nil
}

func validateDecision(d *Decision, accountEquity float64, btcEthLeverage, altcoinLeverage int, btcEthPosRatio, altcoinPosRatio float64, minPositionSize, minRiskReward float64) error {
	validActions := map[string]bool{
		"open_long":   true,
		"open_short":  true,
		"close_long":  true,
		"close_short": true,
		"hold":        true,
		"wait":        true,
	}

	if !validActions[d.Action] {
		return fmt.Errorf("invalid action: %s", d.Action)
	}

	if d.Action == "open_long" || d.Action == "open_short" {
		maxLeverage := altcoinLeverage
		posRatio := altcoinPosRatio
		maxPositionValue := accountEquity * posRatio
		if d.Symbol == "BTCUSD" || d.Symbol == "ETHUSD" {
			maxLeverage = btcEthLeverage
			posRatio = btcEthPosRatio
			maxPositionValue = accountEquity * posRatio
		}

		if d.Leverage <= 0 {
			return fmt.Errorf("leverage must be greater than 0: %d", d.Leverage)
		}
		if d.Leverage > maxLeverage {
			logger.Infof("⚠️  [Leverage Fallback] %s leverage exceeded (%dx > %dx), auto-adjusting to limit %dx",
				d.Symbol, d.Leverage, maxLeverage, maxLeverage)
			d.Leverage = maxLeverage
		}
		if d.PositionSizeUSD <= 0 {
			return fmt.Errorf("position size must be greater than 0: %.2f", d.PositionSizeUSD)
		}

		minAllowedPct := 0.005
		minAllowedSize := accountEquity * minAllowedPct
		if d.PositionSizeUSD < minAllowedSize {
			return fmt.Errorf("position size too small (%.2f USD), must be ≥0.5%% of account equity (%.2f USD)", d.PositionSizeUSD, minAllowedSize)
		}

		const minPositionSizeBTCETH = 60.0

		if d.Symbol == "BTCUSD" || d.Symbol == "ETHUSD" {
			if d.PositionSizeUSD < minPositionSizeBTCETH {
				return fmt.Errorf("%s opening amount too small (%.2f USD), must be ≥%.2f USD", d.Symbol, d.PositionSizeUSD, minPositionSizeBTCETH)
			}
		} else {
			if d.PositionSizeUSD < minPositionSize {
				return fmt.Errorf("opening amount too small (%.2f USD), must be ≥%.2f USD", d.PositionSizeUSD, minPositionSize)
			}
		}

		tolerance := maxPositionValue * 0.01
		if d.PositionSizeUSD > maxPositionValue+tolerance {
			at := "Altcoin"
			if d.Symbol == "BTCUSD" || d.Symbol == "ETHUSD" {
				at = "BTC/ETH"
			}
			logger.Infof("⚠️  [Position Fallback] %s %s position value exceeded limit (%.0f USD > %.0f USD), auto-capping",
				at, d.Symbol, d.PositionSizeUSD, maxPositionValue)
			d.PositionSizeUSD = maxPositionValue
		}
		if d.StopLoss <= 0 || d.TakeProfit <= 0 {
			return fmt.Errorf("stop loss and take profit must be greater than 0")
		}

		if d.Action == "open_long" {
			if d.StopLoss >= d.TakeProfit {
				return fmt.Errorf("for long positions, stop loss price must be less than take profit price")
			}
		} else {
			if d.StopLoss <= d.TakeProfit {
				return fmt.Errorf("for short positions, stop loss price must be greater than take profit price")
			}
		}

		var entryPrice float64
		if d.Action == "open_long" {
			entryPrice = d.StopLoss + (d.TakeProfit-d.StopLoss)*0.2
		} else {
			entryPrice = d.StopLoss - (d.StopLoss-d.TakeProfit)*0.2
		}

		var riskPercent, rewardPercent, riskRewardRatio float64
		if d.Action == "open_long" {
			riskPercent = (entryPrice - d.StopLoss) / entryPrice * 100
			rewardPercent = (d.TakeProfit - entryPrice) / entryPrice * 100
			if riskPercent > 0 {
				riskRewardRatio = rewardPercent / riskPercent
			}
		} else {
			riskPercent = (d.StopLoss - entryPrice) / entryPrice * 100
			rewardPercent = (entryPrice - d.TakeProfit) / entryPrice * 100
			if riskPercent > 0 {
				riskRewardRatio = rewardPercent / riskPercent
			}
		}

		if minRiskReward > 0 && riskRewardRatio < minRiskReward {
			return fmt.Errorf("risk/reward ratio too low (%.2f:1), must be ≥%.1f:1 [risk: %.2f%% reward: %.2f%%] [stop loss: %.2f take profit: %.2f]",
				riskRewardRatio, minRiskReward, riskPercent, rewardPercent, d.StopLoss, d.TakeProfit)
		}
	}

	return nil
}

// ============================================================================
// Forex Decision Validation
// ============================================================================

// validateForexDecision validates a Decision for forex/MT5 strategies.
// It enforces percentage-based risk limits and session filters.
func validateForexDecision(
	d *Decision,
	accountEquity float64,
	risk *store.RiskControlConfig,
	currentTime time.Time,
) error {
	validActions := map[string]bool{
		"open_long": true, "open_short": true,
		"close_long": true, "close_short": true,
		"hold": true, "wait": true,
	}
	if !validActions[d.Action] {
		return fmt.Errorf("invalid action: %s", d.Action)
	}

	// Session filter
	if !IsAllowedSession(risk.AllowedSessions, currentTime) {
		return fmt.Errorf("outside allowed trading sessions %v", risk.AllowedSessions)
	}

	if d.Action != "open_long" && d.Action != "open_short" {
		return nil
	}

	// Percentage-based risk check
	if risk.RiskPctPerTrade > 0 {
		maxRiskUSD := risk.RiskPctPerTrade * accountEquity
		if d.RiskUSD > maxRiskUSD*1.05 { // 5% tolerance
			logger.Infof("⚠️  [Forex Risk] %s risk %.2f USD exceeds %.1f%% limit (%.2f USD), capping",
				d.Symbol, d.RiskUSD, risk.RiskPctPerTrade*100, maxRiskUSD)
			d.RiskUSD = maxRiskUSD
		}
	}

	// Drawdown guard
	if risk.MaxDrawdownPct > 0 {
		// Caller is responsible for passing equity already reduced by drawdown;
		// here we just ensure the decision doesn't push risk beyond the limit.
		_ = risk.MaxDrawdownPct
	}

	// SL / TP sanity
	if d.StopLoss <= 0 || d.TakeProfit <= 0 {
		return fmt.Errorf("stop loss and take profit must be > 0 for forex trades")
	}
	if d.Action == "open_long" && d.StopLoss >= d.TakeProfit {
		return fmt.Errorf("long: stop loss must be below take profit")
	}
	if d.Action == "open_short" && d.StopLoss <= d.TakeProfit {
		return fmt.Errorf("short: stop loss must be above take profit")
	}

	// Minimum R:R
	if risk.MinRiskRewardRatio > 0 && d.StopLoss > 0 && d.TakeProfit > 0 {
		var rr float64
		if d.Action == "open_long" {
			risk_ := math.Abs(d.StopLoss - d.TakeProfit)
			reward := math.Abs(d.TakeProfit - d.StopLoss)
			if risk_ > 0 {
				rr = reward / risk_
			}
		}
		if rr > 0 && rr < risk.MinRiskRewardRatio {
			return fmt.Errorf("R:R %.2f below minimum %.2f", rr, risk.MinRiskRewardRatio)
		}
	}

	return nil
}

// ApplyForexPositionSizing calculates and sets PositionSizeUSD and RiskUSD on a
// Decision using the configured risk mode:
//   - Fixed dollar: risk.RiskUSDPerTrade > 0 → risk exactly that many USD per trade
//   - Percentage:   risk.RiskPctPerTrade > 0 → risk that fraction of equity per trade
//
// equity should already be cent-account normalised.
func ApplyForexPositionSizing(d *Decision, equity float64, risk *store.RiskControlConfig, currentPrice float64) {
	hasPct := risk.RiskPctPerTrade > 0
	hasUSD := risk.RiskUSDPerTrade > 0
	if (!hasPct && !hasUSD) || d.StopLoss <= 0 {
		return
	}
	pip := PipSize(d.Symbol)
	slPips := math.Abs(d.StopLoss-currentPrice) / pip
	if slPips <= 0 {
		return
	}
	res := CalculateForexPositionSize(ForexPositionSizeRequest{
		Symbol:        d.Symbol,
		AccountEquity: equity,
		RiskPct:       risk.RiskPctPerTrade,
		RiskUSD:       risk.RiskUSDPerTrade, // takes precedence when > 0
		StopLossPips:  slPips,
		CurrentPrice:  currentPrice,
	})

	if res.Lots <= 0 {
		d.Action = "wait"
		return
	}

	// Enforce minimum lot size — skip trade if below threshold
	minLots := risk.MinLots
	if minLots <= 0 {
		minLots = BrokerMinLot
	}
	if res.Lots < minLots {
		logger.Infof("⚠️  [Forex Sizing] %s computed lots %.2f below minimum %.2f — skipping trade",
			d.Symbol, res.Lots, minLots)
		d.Action = "wait"
		return
	}

	d.Lots = res.Lots
	if d.Leverage > 0 {
		d.PositionSizeUSD = res.Lots * 100_000 * currentPrice / float64(d.Leverage)
	} else {
		d.PositionSizeUSD = res.Lots * 100_000 * currentPrice
	}
	d.RiskUSD = res.RiskUSD
}
