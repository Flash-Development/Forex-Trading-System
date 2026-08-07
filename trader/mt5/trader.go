package mt5

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"nofx/trader/types"
)

// MT5Trader implements the Trader interface by proxying to the MT5 bridge HTTP API.
// The bridge URL should point to the account-specific endpoint, e.g.:
//
//	http://localhost:8001/accounts/Exness
//
// Symbols are always in clean form (e.g. "EURUSD"). The bridge must be configured
// to use the same symbol names as the Go backend.
type MT5Trader struct {
	bridgeURL  string
	httpClient *http.Client
}

// NewMT5Trader creates a new MT5 trader backed by the given bridge URL.
func NewMT5Trader(bridgeURL string) *MT5Trader {
	return &MT5Trader{
		bridgeURL:  strings.TrimRight(bridgeURL, "/"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (t *MT5Trader) get(path string) (map[string]interface{}, error) {
	resp, err := t.httpClient.Get(t.bridgeURL + path)
	if err != nil {
		return nil, fmt.Errorf("mt5 GET %s: %w", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mt5 GET %s: status %d: %s", path, resp.StatusCode, string(body))
	}
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("mt5 GET %s: decode: %w", path, err)
	}
	return result, nil
}

func (t *MT5Trader) post(path string, payload interface{}) (map[string]interface{}, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	resp, err := t.httpClient.Post(t.bridgeURL+path, "application/json", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("mt5 POST %s: %w", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mt5 POST %s: status %d: %s", path, resp.StatusCode, string(body))
	}
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("mt5 POST %s: decode: %w", path, err)
	}
	return result, nil
}

func (t *MT5Trader) delete(path string) error {
	req, err := http.NewRequest(http.MethodDelete, t.bridgeURL+path, nil)
	if err != nil {
		return err
	}
	resp, err := t.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("mt5 DELETE %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mt5 DELETE %s: status %d: %s", path, resp.StatusCode, string(body))
	}
	return nil
}

// ─── Trader interface ─────────────────────────────────────────────────────────

func (t *MT5Trader) GetBalance() (map[string]interface{}, error) {
	return t.get("/balance")
}

func (t *MT5Trader) GetPositions() ([]map[string]interface{}, error) {
	resp, err := t.httpClient.Get(t.bridgeURL + "/positions")
	if err != nil {
		return nil, fmt.Errorf("mt5 GET /positions: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mt5 GET /positions: status %d: %s", resp.StatusCode, string(body))
	}
	var positions []map[string]interface{}
	if err := json.Unmarshal(body, &positions); err != nil {
		return nil, fmt.Errorf("mt5 GET /positions: decode: %w", err)
	}
	return positions, nil
}

func (t *MT5Trader) OpenLong(symbol string, quantity float64, leverage int) (map[string]interface{}, error) {
	return t.post("/order", map[string]interface{}{
		"symbol":   symbol,
		"action":   "open_long",
		"lots":     quantity,
		"leverage": leverage,
	})
}

func (t *MT5Trader) OpenShort(symbol string, quantity float64, leverage int) (map[string]interface{}, error) {
	return t.post("/order", map[string]interface{}{
		"symbol":   symbol,
		"action":   "open_short",
		"lots":     quantity,
		"leverage": leverage,
	})
}

func (t *MT5Trader) CloseLong(symbol string, _ float64) (map[string]interface{}, error) {
	return t.post("/order", map[string]interface{}{
		"symbol": symbol,
		"action": "close_long",
	})
}

func (t *MT5Trader) CloseShort(symbol string, _ float64) (map[string]interface{}, error) {
	return t.post("/order", map[string]interface{}{
		"symbol": symbol,
		"action": "close_short",
	})
}

// SetLeverage is a no-op for MT5 — leverage is set per-order.
func (t *MT5Trader) SetLeverage(_ string, _ int) error { return nil }

// SetMarginMode is a no-op for MT5 — margin mode is configured in the terminal.
func (t *MT5Trader) SetMarginMode(_ string, _ bool) error { return nil }

func (t *MT5Trader) GetMarketPrice(symbol string) (float64, error) {
	result, err := t.get("/price/" + symbol)
	if err != nil {
		return 0, err
	}
	if mid, ok := result["mid"].(float64); ok {
		return mid, nil
	}
	if ask, ok := result["ask"].(float64); ok {
		return ask, nil
	}
	return 0, fmt.Errorf("mt5: no price in response for %s", symbol)
}

func (t *MT5Trader) SetStopLoss(symbol string, positionSide string, quantity, stopPrice float64) error {
	_, err := t.post("/stop_loss", map[string]interface{}{
		"symbol":        symbol,
		"position_side": positionSide,
		"quantity":      quantity,
		"price":         stopPrice,
	})
	return err
}

func (t *MT5Trader) SetTakeProfit(symbol string, positionSide string, quantity, takeProfitPrice float64) error {
	_, err := t.post("/take_profit", map[string]interface{}{
		"symbol":        symbol,
		"position_side": positionSide,
		"quantity":      quantity,
		"price":         takeProfitPrice,
	})
	return err
}

func (t *MT5Trader) CancelStopLossOrders(symbol string) error {
	return t.delete("/orders/" + symbol)
}

func (t *MT5Trader) CancelTakeProfitOrders(symbol string) error {
	return t.delete("/orders/" + symbol)
}

func (t *MT5Trader) CancelAllOrders(symbol string) error {
	return t.delete("/orders/" + symbol)
}

func (t *MT5Trader) CancelStopOrders(symbol string) error {
	return t.delete("/orders/" + symbol)
}

// FormatQuantity returns the quantity as-is — MT5 uses lot sizes internally.
func (t *MT5Trader) FormatQuantity(_ string, quantity float64) (string, error) {
	return fmt.Sprintf("%.2f", quantity), nil
}

func (t *MT5Trader) GetOrderStatus(symbol string, orderID string) (map[string]interface{}, error) {
	// MT5 bridge doesn't expose a per-order status endpoint; return a synthetic FILLED response.
	return map[string]interface{}{
		"status":       "FILLED",
		"symbol":       symbol,
		"order_id":     orderID,
		"avg_price":    0.0,
		"executed_qty": 0.0,
		"commission":   0.0,
	}, nil
}

func (t *MT5Trader) GetClosedPnL(startTime time.Time, limit int) ([]types.ClosedPnLRecord, error) {
	hours := int(time.Since(startTime).Hours()) + 1
	if hours < 1 {
		hours = 1
	}

	resp, err := t.httpClient.Get(fmt.Sprintf("%s/history?hours=%d&limit=%d", t.bridgeURL, hours, limit))
	if err != nil {
		return nil, fmt.Errorf("mt5 GET /history: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mt5 GET /history: status %d: %s", resp.StatusCode, string(body))
	}

	var deals []map[string]interface{}
	if err := json.Unmarshal(body, &deals); err != nil {
		return nil, fmt.Errorf("mt5 GET /history: decode: %w", err)
	}

	var records []types.ClosedPnLRecord
	for _, d := range deals {
		action, _ := d["action"].(string)
		if !strings.HasPrefix(action, "close_") {
			continue
		}
		side := "long"
		if strings.HasSuffix(action, "short") {
			side = "short"
		}
		symbol, _ := d["symbol"].(string)
		exitPrice, _ := d["price"].(float64)
		volume, _ := d["volume"].(float64)
		pnl, _ := d["profit"].(float64)
		commission, _ := d["commission"].(float64)
		ts, _ := d["time"].(float64)
		exitTime := time.Unix(int64(ts), 0)

		records = append(records, types.ClosedPnLRecord{
			Symbol:      symbol,
			Side:        side,
			ExitPrice:   exitPrice,
			Quantity:    volume,
			RealizedPnL: pnl,
			Fee:         commission,
			ExitTime:    exitTime,
			CloseType:   "manual",
		})
	}
	return records, nil
}

func (t *MT5Trader) GetOpenOrders(symbol string) ([]types.OpenOrder, error) {
	resp, err := t.httpClient.Get(t.bridgeURL + "/orders/" + symbol)
	if err != nil {
		return nil, fmt.Errorf("mt5 GET /orders/%s: %w", symbol, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mt5 GET /orders/%s: status %d: %s", symbol, resp.StatusCode, string(body))
	}

	var raw []map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("mt5 GET /orders/%s: decode: %w", symbol, err)
	}

	var orders []types.OpenOrder
	for _, o := range raw {
		orderID, _ := o["orderId"].(string)
		sym, _ := o["symbol"].(string)
		side, _ := o["side"].(string)
		price, _ := o["price"].(float64)
		qty, _ := o["quantity"].(float64)
		orders = append(orders, types.OpenOrder{
			OrderID:  orderID,
			Symbol:   sym,
			Side:     side,
			Price:    price,
			Quantity: qty,
			Status:   "NEW",
		})
	}
	return orders, nil
}
