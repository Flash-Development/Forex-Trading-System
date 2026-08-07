package trader

import (
	"fmt"
	"nofx/kernel"
	"nofx/logger"
	"nofx/market"
	"nofx/store"
	"strings"
	"time"
)

// executeDecisionWithRecord executes AI decision and records detailed information
func (at *AutoTrader) executeDecisionWithRecord(decision *kernel.Decision, actionRecord *store.DecisionAction) error {
	switch decision.Action {
	case "open_long":
		return at.executeOpenLongWithRecord(decision, actionRecord)
	case "open_short":
		return at.executeOpenShortWithRecord(decision, actionRecord)
	case "close_long":
		return at.executeCloseLongWithRecord(decision, actionRecord)
	case "close_short":
		return at.executeCloseShortWithRecord(decision, actionRecord)
	case "hold", "wait":
		return nil
	default:
		return fmt.Errorf("unknown action: %s", decision.Action)
	}
}

// isMT5 returns true when the trader is connected to a MetaTrader 5 bridge.
func (at *AutoTrader) isMT5() bool {
	return strings.ToLower(at.exchange) == "mt5"
}

// normalizeSymbolForDB returns the symbol suitable for database lookups.
// For MT5/forex symbols (e.g. EURUSDc) we do NOT append USD.
func (at *AutoTrader) normalizeSymbolForDB(symbol string) string {
	if at.isMT5() || market.IsForexSymbol(symbol) {
		return strings.ToUpper(symbol)
	}
	return market.Normalize(symbol)
}

// calcQuantity converts a USD notional position size to the quantity expected
// by the exchange:
//   - MT5: run the risk engine to get proper lot size based on SL distance
//   - Crypto: divide by current price to get base-asset units
func (at *AutoTrader) calcQuantity(positionSizeUSD, currentPrice float64) float64 {
	if at.isMT5() {
		// For MT5, quantity is lots — already set by applyForexSizing
		return positionSizeUSD
	}
	if currentPrice <= 0 {
		return 0
	}
	return positionSizeUSD / currentPrice
}

// applyForexSizing runs the risk engine for MT5 decisions, overwriting
// decision.Lots and decision.PositionSizeUSD with correctly computed values.
// Returns the lot size to send to the broker (0 means skip the trade).
func (at *AutoTrader) applyForexSizing(decision *kernel.Decision, equity, currentPrice float64) float64 {
	if at.config.StrategyConfig == nil {
		return 0
	}
	risk := &at.config.StrategyConfig.RiskControl

	// Normalise cent-account equity before sizing
	effectiveEquity := kernel.NormaliseCentAccountEquity(equity, risk.IsCentAccount)

	kernel.ApplyForexPositionSizing(decision, effectiveEquity, risk, currentPrice)

	if decision.Action == "wait" || decision.Lots <= 0 {
		return 0
	}
	return decision.Lots
}

// adjustPositionSize applies risk controls and returns the final USD notional to use.
func (at *AutoTrader) adjustPositionSize(decision *kernel.Decision, availableBalance, equity float64) float64 {
	// Position value ratio cap (applies to all exchanges)
	adjusted, wasCapped := at.enforcePositionValueRatio(decision.PositionSizeUSD, equity, decision.Symbol)
	if wasCapped {
		decision.PositionSizeUSD = adjusted
	}

	// Crypto-only: auto-reduce if margin would be insufficient.
	// MT5 brokers manage margin themselves; applying this formula would incorrectly
	// cap positions on small cent accounts.
	if !at.isMT5() && decision.Leverage > 0 {
		marginFactor := 1.01/float64(decision.Leverage) + 0.001
		maxAffordable := availableBalance / marginFactor
		if decision.PositionSizeUSD > maxAffordable {
			capped := maxAffordable * 0.98
			logger.Infof("  ⚠️ Position size %.2f exceeds max affordable %.2f, auto-reducing to %.2f",
				decision.PositionSizeUSD, maxAffordable, capped)
			decision.PositionSizeUSD = capped
		}
	}

	return decision.PositionSizeUSD
}

// ─── Open Long ───────────────────────────────────────────────────────────────

func (at *AutoTrader) executeOpenLongWithRecord(decision *kernel.Decision, actionRecord *store.DecisionAction) error {
	logger.Infof("  📈 Open long: %s", decision.Symbol)

	positions, err := at.trader.GetPositions()
	if err != nil {
		return fmt.Errorf("failed to get positions: %w", err)
	}
	if err := at.enforceMaxPositions(len(positions)); err != nil {
		return err
	}
	for _, pos := range positions {
		if pos["symbol"] == decision.Symbol && pos["side"] == "long" {
			return fmt.Errorf("❌ %s already has a long position, close it first", decision.Symbol)
		}
	}

	currentPrice, err := at.trader.GetMarketPrice(decision.Symbol)
	if err != nil {
		return fmt.Errorf("failed to get market price for %s: %w", decision.Symbol, err)
	}

	balance, err := at.trader.GetBalance()
	if err != nil {
		return fmt.Errorf("failed to get account balance: %w", err)
	}
	availableBalance, equity := extractBalanceFields(balance)

	// For MT5: compute lot size from risk engine before any size adjustments
	if at.isMT5() {
		lots := at.applyForexSizing(decision, equity, currentPrice)
		if lots <= 0 {
			return fmt.Errorf("⛔ %s: lot size below broker minimum after risk sizing — skipping trade", decision.Symbol)
		}
		actionRecord.Quantity = lots
		actionRecord.Price = currentPrice
		order, err := at.trader.OpenLong(decision.Symbol, lots, decision.Leverage)
		if err != nil {
			return err
		}
		if orderID, ok := order["orderId"].(int64); ok {
			actionRecord.OrderID = orderID
		}
		logger.Infof("  ✓ Long opened (forex): %s lots=%.2f sl=%.5f tp=%.5f order=%v", decision.Symbol, lots, decision.StopLoss, decision.TakeProfit, order["orderId"])
		at.recordAndConfirmOrder(order, decision.Symbol, "open_long", lots, currentPrice, decision.Leverage, 0)
		at.positionFirstSeenTime[decision.Symbol+"_long"] = time.Now().UnixMilli()
		if decision.StopLoss > 0 {
			if err := at.trader.SetStopLoss(decision.Symbol, "LONG", lots, decision.StopLoss); err != nil {
				logger.Infof("  ⚠ Failed to set stop loss: %v", err)
			}
		}
		if decision.TakeProfit > 0 {
			if err := at.trader.SetTakeProfit(decision.Symbol, "LONG", lots, decision.TakeProfit); err != nil {
				logger.Infof("  ⚠ Failed to set take profit: %v", err)
			}
		}
		return nil
	}

	actualSize := at.adjustPositionSize(decision, availableBalance, equity)

	// Skip minimum size check for MT5 — lot sizes are tiny (0.01 lot = ~$1)
	if !at.isMT5() {
		if err := at.enforceMinPositionSize(actualSize); err != nil {
			return err
		}
	}

	quantity := at.calcQuantity(actualSize, currentPrice)
	actionRecord.Quantity = quantity
	actionRecord.Price = currentPrice

	if !at.isMT5() {
		if err := at.trader.SetMarginMode(decision.Symbol, at.config.IsCrossMargin); err != nil {
			logger.Infof("  ⚠️ Failed to set margin mode: %v", err)
		}
	}

	order, err := at.trader.OpenLong(decision.Symbol, quantity, decision.Leverage)
	if err != nil {
		return err
	}
	if orderID, ok := order["orderId"].(int64); ok {
		actionRecord.OrderID = orderID
	}
	logger.Infof("  ✓ Long opened: %s qty=%.4f price=%.5f order=%v", decision.Symbol, quantity, currentPrice, order["orderId"])

	at.recordAndConfirmOrder(order, decision.Symbol, "open_long", quantity, currentPrice, decision.Leverage, 0)
	at.positionFirstSeenTime[decision.Symbol+"_long"] = time.Now().UnixMilli()

	// Set SL/TP — for MT5 the bridge already accepted sl/tp in the order request,
	// but we also call the dedicated endpoints so they appear on the chart.
	if decision.StopLoss > 0 {
		if err := at.trader.SetStopLoss(decision.Symbol, "LONG", quantity, decision.StopLoss); err != nil {
			logger.Infof("  ⚠ Failed to set stop loss: %v", err)
		}
	}
	if decision.TakeProfit > 0 {
		if err := at.trader.SetTakeProfit(decision.Symbol, "LONG", quantity, decision.TakeProfit); err != nil {
			logger.Infof("  ⚠ Failed to set take profit: %v", err)
		}
	}
	return nil
}

// ─── Open Short ──────────────────────────────────────────────────────────────

func (at *AutoTrader) executeOpenShortWithRecord(decision *kernel.Decision, actionRecord *store.DecisionAction) error {
	logger.Infof("  📉 Open short: %s", decision.Symbol)

	positions, err := at.trader.GetPositions()
	if err != nil {
		return fmt.Errorf("failed to get positions: %w", err)
	}
	if err := at.enforceMaxPositions(len(positions)); err != nil {
		return err
	}
	for _, pos := range positions {
		if pos["symbol"] == decision.Symbol && pos["side"] == "short" {
			return fmt.Errorf("❌ %s already has a short position, close it first", decision.Symbol)
		}
	}

	currentPrice, err := at.trader.GetMarketPrice(decision.Symbol)
	if err != nil {
		return fmt.Errorf("failed to get market price for %s: %w", decision.Symbol, err)
	}

	balance, err := at.trader.GetBalance()
	if err != nil {
		return fmt.Errorf("failed to get account balance: %w", err)
	}
	availableBalance, equity := extractBalanceFields(balance)

	// For MT5: compute lot size from risk engine before any size adjustments
	if at.isMT5() {
		lots := at.applyForexSizing(decision, equity, currentPrice)
		if lots <= 0 {
			return fmt.Errorf("⛔ %s: lot size below broker minimum after risk sizing — skipping trade", decision.Symbol)
		}
		actionRecord.Quantity = lots
		actionRecord.Price = currentPrice
		order, err := at.trader.OpenShort(decision.Symbol, lots, decision.Leverage)
		if err != nil {
			return err
		}
		if orderID, ok := order["orderId"].(int64); ok {
			actionRecord.OrderID = orderID
		}
		logger.Infof("  ✓ Short opened (forex): %s lots=%.2f sl=%.5f tp=%.5f order=%v", decision.Symbol, lots, decision.StopLoss, decision.TakeProfit, order["orderId"])
		at.recordAndConfirmOrder(order, decision.Symbol, "open_short", lots, currentPrice, decision.Leverage, 0)
		at.positionFirstSeenTime[decision.Symbol+"_short"] = time.Now().UnixMilli()
		if decision.StopLoss > 0 {
			if err := at.trader.SetStopLoss(decision.Symbol, "SHORT", lots, decision.StopLoss); err != nil {
				logger.Infof("  ⚠ Failed to set stop loss: %v", err)
			}
		}
		if decision.TakeProfit > 0 {
			if err := at.trader.SetTakeProfit(decision.Symbol, "SHORT", lots, decision.TakeProfit); err != nil {
				logger.Infof("  ⚠ Failed to set take profit: %v", err)
			}
		}
		return nil
	}

	actualSize := at.adjustPositionSize(decision, availableBalance, equity)

	if !at.isMT5() {
		if err := at.enforceMinPositionSize(actualSize); err != nil {
			return err
		}
	}

	quantity := at.calcQuantity(actualSize, currentPrice)
	actionRecord.Quantity = quantity
	actionRecord.Price = currentPrice

	if !at.isMT5() {
		if err := at.trader.SetMarginMode(decision.Symbol, at.config.IsCrossMargin); err != nil {
			logger.Infof("  ⚠️ Failed to set margin mode: %v", err)
		}
	}

	order, err := at.trader.OpenShort(decision.Symbol, quantity, decision.Leverage)
	if err != nil {
		return err
	}
	if orderID, ok := order["orderId"].(int64); ok {
		actionRecord.OrderID = orderID
	}
	logger.Infof("  ✓ Short opened: %s qty=%.4f price=%.5f order=%v", decision.Symbol, quantity, currentPrice, order["orderId"])

	at.recordAndConfirmOrder(order, decision.Symbol, "open_short", quantity, currentPrice, decision.Leverage, 0)
	at.positionFirstSeenTime[decision.Symbol+"_short"] = time.Now().UnixMilli()

	if decision.StopLoss > 0 {
		if err := at.trader.SetStopLoss(decision.Symbol, "SHORT", quantity, decision.StopLoss); err != nil {
			logger.Infof("  ⚠ Failed to set stop loss: %v", err)
		}
	}
	if decision.TakeProfit > 0 {
		if err := at.trader.SetTakeProfit(decision.Symbol, "SHORT", quantity, decision.TakeProfit); err != nil {
			logger.Infof("  ⚠ Failed to set take profit: %v", err)
		}
	}
	return nil
}

// ─── Close Long ──────────────────────────────────────────────────────────────

func (at *AutoTrader) executeCloseLongWithRecord(decision *kernel.Decision, actionRecord *store.DecisionAction) error {
	logger.Infof("  🔄 Close long: %s", decision.Symbol)

	currentPrice, err := at.trader.GetMarketPrice(decision.Symbol)
	if err != nil {
		return fmt.Errorf("failed to get market price for %s: %w", decision.Symbol, err)
	}
	actionRecord.Price = currentPrice

	var entryPrice, quantity float64
	dbSymbol := at.normalizeSymbolForDB(decision.Symbol)

	if at.store != nil {
		if openPos, err := at.store.Position().GetOpenPositionBySymbol(at.id, dbSymbol, "LONG"); err == nil && openPos != nil {
			quantity = openPos.Quantity
			entryPrice = openPos.EntryPrice
			logger.Infof("  📊 DB position: qty=%.8f entry=%.5f", quantity, entryPrice)
		}
	}
	if quantity == 0 {
		if positions, err := at.trader.GetPositions(); err == nil {
			for _, pos := range positions {
				if pos["symbol"] == decision.Symbol && pos["side"] == "long" {
					if ep, ok := pos["entryPrice"].(float64); ok {
						entryPrice = ep
					}
					if amt, ok := pos["positionAmt"].(float64); ok && amt > 0 {
						quantity = amt
					}
					break
				}
			}
		}
		logger.Infof("  📊 Exchange position: qty=%.8f entry=%.5f", quantity, entryPrice)
	}

	order, err := at.trader.CloseLong(decision.Symbol, 0)
	if err != nil {
		return err
	}
	if orderID, ok := order["orderId"].(int64); ok {
		actionRecord.OrderID = orderID
	}
	at.recordAndConfirmOrder(order, decision.Symbol, "close_long", quantity, currentPrice, 0, entryPrice)
	logger.Infof("  ✓ Long closed: %s @ %.5f", decision.Symbol, currentPrice)
	return nil
}

// ─── Close Short ─────────────────────────────────────────────────────────────

func (at *AutoTrader) executeCloseShortWithRecord(decision *kernel.Decision, actionRecord *store.DecisionAction) error {
	logger.Infof("  🔄 Close short: %s", decision.Symbol)

	currentPrice, err := at.trader.GetMarketPrice(decision.Symbol)
	if err != nil {
		return fmt.Errorf("failed to get market price for %s: %w", decision.Symbol, err)
	}
	actionRecord.Price = currentPrice

	var entryPrice, quantity float64
	dbSymbol := at.normalizeSymbolForDB(decision.Symbol)

	if at.store != nil {
		if openPos, err := at.store.Position().GetOpenPositionBySymbol(at.id, dbSymbol, "SHORT"); err == nil && openPos != nil {
			quantity = openPos.Quantity
			entryPrice = openPos.EntryPrice
			logger.Infof("  📊 DB position: qty=%.8f entry=%.5f", quantity, entryPrice)
		}
	}
	if quantity == 0 {
		if positions, err := at.trader.GetPositions(); err == nil {
			for _, pos := range positions {
				if pos["symbol"] == decision.Symbol && pos["side"] == "short" {
					if ep, ok := pos["entryPrice"].(float64); ok {
						entryPrice = ep
					}
					if amt, ok := pos["positionAmt"].(float64); ok {
						quantity = amt
						if quantity < 0 {
							quantity = -quantity
						}
					}
					break
				}
			}
		}
		logger.Infof("  📊 Exchange position: qty=%.8f entry=%.5f", quantity, entryPrice)
	}

	order, err := at.trader.CloseShort(decision.Symbol, 0)
	if err != nil {
		return err
	}
	if orderID, ok := order["orderId"].(int64); ok {
		actionRecord.OrderID = orderID
	}
	at.recordAndConfirmOrder(order, decision.Symbol, "close_short", quantity, currentPrice, 0, entryPrice)
	logger.Infof("  ✓ Short closed: %s @ %.5f", decision.Symbol, currentPrice)
	return nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// extractBalanceFields pulls availableBalance and equity from a balance map.
func extractBalanceFields(balance map[string]interface{}) (availableBalance, equity float64) {
	if v, ok := balance["availableBalance"].(float64); ok {
		availableBalance = v
	}
	if v, ok := balance["totalEquity"].(float64); ok && v > 0 {
		equity = v
	} else if v, ok := balance["total_equity"].(float64); ok && v > 0 {
		equity = v
	} else if v, ok := balance["totalWalletBalance"].(float64); ok && v > 0 {
		equity = v
	} else {
		equity = availableBalance
	}
	return
}

// Ensure store import is used (market.Normalize is used in normalizeSymbolForDB)
var _ = store.DecisionAction{}
