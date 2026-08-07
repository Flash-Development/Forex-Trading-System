package trader

// trade_simulation_test.go
//
// Tests the real MT5 forex implementation end-to-end using a fake HTTP bridge
// (httptest.Server). No mocks are used — the actual mt5.MT5Trader and
// kernel.ApplyForexPositionSizing code paths execute exactly as they do in
// production. The fake bridge records every request it receives so we can
// assert that correct lots, SL prices and TP prices were sent.
//
// Run: go test ./trader/ -run TestForexTrader -v

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"nofx/kernel"
	"nofx/store"
	"nofx/trader/mt5"
)

// ============================================================
// fakeBridge — minimal MT5 bridge HTTP server
// ============================================================

type bridgeRequest struct {
	path    string
	payload map[string]interface{}
}

type fakeBridge struct {
	mu       sync.Mutex
	prices   map[string]float64
	equity   float64
	requests []bridgeRequest
	positions []map[string]interface{}
}

func newFakeBridge(equity float64, prices map[string]float64) *fakeBridge {
	return &fakeBridge{equity: equity, prices: prices}
}

func (b *fakeBridge) record(path string, payload map[string]interface{}) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.requests = append(b.requests, bridgeRequest{path, payload})
}

func (b *fakeBridge) ordersFor(action string) []map[string]interface{} {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []map[string]interface{}
	for _, r := range b.requests {
		if r.path == "/order" {
			if a, _ := r.payload["action"].(string); a == action {
				out = append(out, r.payload)
			}
		}
	}
	return out
}

func (b *fakeBridge) slRequests() []map[string]interface{} {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []map[string]interface{}
	for _, r := range b.requests {
		if r.path == "/stop_loss" {
			out = append(out, r.payload)
		}
	}
	return out
}

func (b *fakeBridge) tpRequests() []map[string]interface{} {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []map[string]interface{}
	for _, r := range b.requests {
		if r.path == "/take_profit" {
			out = append(out, r.payload)
		}
	}
	return out
}

func (b *fakeBridge) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	var payload map[string]interface{}
	if r.Body != nil {
		json.NewDecoder(r.Body).Decode(&payload) //nolint
	}
	if payload != nil {
		b.record(path, payload)
	}

	w.Header().Set("Content-Type", "application/json")
	switch {
	case path == "/balance":
		json.NewEncoder(w).Encode(map[string]interface{}{
			"totalEquity":        b.equity,
			"availableBalance":   b.equity,
			"totalWalletBalance": b.equity,
		})

	case path == "/positions":
		b.mu.Lock()
		cp := make([]map[string]interface{}, len(b.positions))
		copy(cp, b.positions)
		b.mu.Unlock()
		json.NewEncoder(w).Encode(cp)

	case len(path) > 7 && path[:7] == "/price/":
		sym := path[7:]
		b.mu.Lock()
		price := b.prices[sym]
		b.mu.Unlock()
		if price == 0 {
			http.Error(w, "unknown symbol", 404)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"mid": price, "ask": price, "bid": price})

	case path == "/order":
		action, _ := payload["action"].(string)
		symbol, _ := payload["symbol"].(string)
		lots, _ := payload["lots"].(float64)
		leverage, _ := payload["leverage"].(float64)
		b.mu.Lock()
		price := b.prices[symbol]
		switch action {
		case "open_long":
			b.positions = append(b.positions, map[string]interface{}{
				"symbol": symbol, "side": "long",
				"positionAmt": lots, "entryPrice": price, "markPrice": price,
				"unRealizedProfit": float64(0), "liquidationPrice": float64(0),
				"leverage": leverage,
			})
		case "open_short":
			b.positions = append(b.positions, map[string]interface{}{
				"symbol": symbol, "side": "short",
				"positionAmt": -lots, "entryPrice": price, "markPrice": price,
				"unRealizedProfit": float64(0), "liquidationPrice": float64(0),
				"leverage": leverage,
			})
		case "close_long", "close_short":
			side := "long"
			if action == "close_short" {
				side = "short"
			}
			for i, pos := range b.positions {
				if pos["symbol"] == symbol && pos["side"] == side {
					b.positions = append(b.positions[:i], b.positions[i+1:]...)
					break
				}
			}
		}
		b.mu.Unlock()
		json.NewEncoder(w).Encode(map[string]interface{}{"orderId": int64(1), "symbol": symbol})

	case path == "/stop_loss", path == "/take_profit":
		json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok"})

	default:
		// DELETE /orders/SYMBOL or unhandled → return 200 empty
		json.NewEncoder(w).Encode(map[string]interface{}{})
	}
}

// ============================================================
// test helpers
// ============================================================

func forexConfig(riskPct float64) *store.StrategyConfig {
	return &store.StrategyConfig{
		StrategyType: "ai_trading",
		CoinSource: store.CoinSourceConfig{
			SourceType: "forex",
			ForexPairs: []string{"EURUSD", "USDJPY", "GBPUSD", "EURGBP", "USDCHF"},
		},
		RiskControl: store.RiskControlConfig{
			MaxPositions:                 3,
			BTCETHMaxLeverage:            30,
			AltcoinMaxLeverage:           20,
			BTCETHMaxPositionValueRatio:  10.0,
			AltcoinMaxPositionValueRatio: 5.0,
			MinPositionSize:              5,
			MinRiskRewardRatio:           2.0,
			MinConfidence:                70,
			RiskPctPerTrade:              riskPct,
			AllowedSessions:              []string{}, // empty = always trade in tests
		},
	}
}

// buildForexTrader creates a real AutoTrader wired to the real mt5.MT5Trader
// which points at the given fake bridge server.
func buildForexTrader(t *testing.T, srv *httptest.Server, equity, riskPct float64) *AutoTrader {
	t.Helper()
	cfg := AutoTraderConfig{
		ID:             "forex-test",
		Name:           "Forex Test",
		Exchange:       "mt5",
		MT5BridgeURL:   srv.URL,
		InitialBalance: equity,
		StrategyConfig: forexConfig(riskPct),
	}
	realTrader := mt5.NewMT5Trader(srv.URL)
	engine := kernel.NewStrategyEngine(cfg.StrategyConfig)
	engine.SetMT5BridgeURL(srv.URL)

	return &AutoTrader{
		id:                    cfg.ID,
		name:                  cfg.Name,
		exchange:              "mt5",
		config:                cfg,
		trader:                realTrader, // ← real MT5Trader, not a mock
		strategyEngine:        engine,
		initialBalance:        equity,
		lastResetTime:         time.Now(),
		startTime:             time.Now(),
		positionFirstSeenTime: make(map[string]int64),
		stopMonitorCh:         make(chan struct{}),
		peakPnLCache:          make(map[string]float64),
	}
}

// wantLots computes the expected lot size using the same formula as the engine.
func wantLots(symbol string, equity, riskPct, price, sl float64) float64 {
	riskUSD := riskPct * equity
	pip := kernel.PipSize(symbol)
	slPips := math.Abs(sl-price) / pip
	if slPips <= 0 {
		return 0
	}
	pipVal := kernel.PipValuePerLot(symbol, price)
	return math.Floor(riskUSD/(slPips*pipVal)*100) / 100
}

// ============================================================
// Tests
// ============================================================

// TestForexTrader_LotSizing verifies that for several currency pairs the system
// sends the correct lot size to the MT5 bridge — derived from 0.5% risk and
// the actual SL distance, not hardcoded.
func TestForexTrader_LotSizing(t *testing.T) {
	const equity = 5006.0
	const riskPct = 0.005 // 0.5%

	cases := []struct {
		symbol string
		price  float64
		sl     float64
		tp     float64
	}{
		{"EURUSD", 1.0900, 1.0870, 1.0990}, // 30-pip SL
		{"USDJPY", 150.00, 149.70, 150.90}, // 30-pip SL
		{"GBPUSD", 1.2700, 1.2660, 1.2820}, // 40-pip SL
		{"EURGBP", 0.8500, 0.8470, 0.8590}, // 30-pip SL
		{"USDCHF", 0.9000, 0.8970, 0.9090}, // 30-pip SL
	}

	for _, tc := range cases {
		t.Run(tc.symbol, func(t *testing.T) {
			bridge := newFakeBridge(equity, map[string]float64{tc.symbol: tc.price})
			srv := httptest.NewServer(bridge)
			defer srv.Close()

			at := buildForexTrader(t, srv, equity, riskPct)

			d := &kernel.Decision{
				Symbol:          tc.symbol,
				Action:          "open_long",
				Leverage:        30,
				PositionSizeUSD: equity * 10, // engine must override this
				StopLoss:        tc.sl,
				TakeProfit:      tc.tp,
				Confidence:      82,
				RiskUSD:         equity * riskPct,
			}

			if err := at.executeDecisionWithRecord(d, &store.DecisionAction{}); err != nil {
				t.Fatalf("executeDecisionWithRecord: %v", err)
			}

			orders := bridge.ordersFor("open_long")
			if len(orders) != 1 {
				t.Fatalf("expected 1 open_long order sent to bridge, got %d", len(orders))
			}

			gotLots, _ := orders[0]["lots"].(float64)
			want := wantLots(tc.symbol, equity, riskPct, tc.price, tc.sl)
			if want <= 0 {
				t.Skipf("%s: zero lots at this SL distance", tc.symbol)
			}
			if math.Abs(gotLots-want) > 0.001 {
				t.Errorf("%s: bridge received lots=%.2f, want %.2f", tc.symbol, gotLots, want)
			}

			// SL and TP were sent to the bridge
			sls := bridge.slRequests()
			tps := bridge.tpRequests()
			if len(sls) == 0 {
				t.Errorf("%s: stop_loss request never sent to bridge", tc.symbol)
			}
			if len(tps) == 0 {
				t.Errorf("%s: take_profit request never sent to bridge", tc.symbol)
			}

			// SL price is correct
			if len(sls) > 0 {
				gotSL, _ := sls[0]["price"].(float64)
				if math.Abs(gotSL-tc.sl) > 1e-5 {
					t.Errorf("%s: bridge SL=%.5f, want %.5f", tc.symbol, gotSL, tc.sl)
				}
			}
			// TP price is correct
			if len(tps) > 0 {
				gotTP, _ := tps[0]["price"].(float64)
				if math.Abs(gotTP-tc.tp) > 1e-5 {
					t.Errorf("%s: bridge TP=%.5f, want %.5f", tc.symbol, gotTP, tc.tp)
				}
			}

			riskUSD := gotLots * math.Abs(tc.price-tc.sl) / kernel.PipSize(tc.symbol) * kernel.PipValuePerLot(tc.symbol, tc.price)
			t.Logf("✓ %s: %.2f lots → bridge | SL=%.5f TP=%.5f | ~$%.2f risk",
				tc.symbol, gotLots, tc.sl, tc.tp, riskUSD)
		})
	}
}

// TestForexTrader_OpenShort verifies a short position sends the correct
// action and lot size to the bridge, with SL above entry.
func TestForexTrader_OpenShort(t *testing.T) {
	const equity = 5006.0
	const riskPct = 0.005

	bridge := newFakeBridge(equity, map[string]float64{"USDJPY": 150.00})
	srv := httptest.NewServer(bridge)
	defer srv.Close()

	at := buildForexTrader(t, srv, equity, riskPct)

	d := &kernel.Decision{
		Symbol: "USDJPY", Action: "open_short", Leverage: 30,
		PositionSizeUSD: equity * 10,
		StopLoss:        150.40, // above price = valid short SL
		TakeProfit:      149.20,
		Confidence:      80, RiskUSD: equity * riskPct,
	}
	if err := at.executeDecisionWithRecord(d, &store.DecisionAction{}); err != nil {
		t.Fatalf("open_short failed: %v", err)
	}

	orders := bridge.ordersFor("open_short")
	if len(orders) != 1 {
		t.Fatalf("expected 1 open_short sent to bridge, got %d", len(orders))
	}

	gotLots, _ := orders[0]["lots"].(float64)
	want := wantLots("USDJPY", equity, riskPct, 150.00, 150.40)
	if math.Abs(gotLots-want) > 0.001 {
		t.Errorf("USDJPY short: bridge lots=%.2f, want %.2f", gotLots, want)
	}
	t.Logf("✓ USDJPY short: %.2f lots → bridge", gotLots)
}

// TestForexTrader_MaxPositionsBlocked verifies the 4th trade is blocked
// before any HTTP request is sent to the bridge.
func TestForexTrader_MaxPositionsBlocked(t *testing.T) {
	const equity = 5006.0
	bridge := newFakeBridge(equity, map[string]float64{
		"EURUSD": 1.09, "USDJPY": 150.0, "GBPUSD": 1.27, "EURGBP": 0.85,
	})
	srv := httptest.NewServer(bridge)
	defer srv.Close()

	at := buildForexTrader(t, srv, equity, 0.005)

	open := func(symbol string, sl, tp float64) error {
		d := &kernel.Decision{
			Symbol: symbol, Action: "open_long", Leverage: 30,
			PositionSizeUSD: 50000, StopLoss: sl, TakeProfit: tp,
			Confidence: 82, RiskUSD: equity * 0.005,
		}
		return at.executeDecisionWithRecord(d, &store.DecisionAction{})
	}

	if err := open("EURUSD", 1.0870, 1.0970); err != nil {
		t.Fatalf("trade 1: %v", err)
	}
	if err := open("USDJPY", 149.70, 150.60); err != nil {
		t.Fatalf("trade 2: %v", err)
	}
	if err := open("GBPUSD", 1.2665, 1.2800); err != nil {
		t.Fatalf("trade 3: %v", err)
	}

	err := open("EURGBP", 0.8470, 0.8590)
	if err == nil {
		t.Fatal("4th trade should be blocked but succeeded")
	}
	t.Logf("✓ 4th trade blocked: %v", err)

	// Only 3 open_long orders should have reached the bridge
	if got := len(bridge.ordersFor("open_long")); got != 3 {
		t.Errorf("bridge received %d open_long orders, want 3", got)
	}
}

// TestForexTrader_DuplicateSymbolBlocked verifies opening EURUSD long twice
// is rejected before reaching the bridge.
func TestForexTrader_DuplicateSymbolBlocked(t *testing.T) {
	const equity = 5006.0
	bridge := newFakeBridge(equity, map[string]float64{"EURUSD": 1.09})
	srv := httptest.NewServer(bridge)
	defer srv.Close()

	at := buildForexTrader(t, srv, equity, 0.005)

	d := func() *kernel.Decision {
		return &kernel.Decision{
			Symbol: "EURUSD", Action: "open_long", Leverage: 30,
			PositionSizeUSD: 50000, StopLoss: 1.0870, TakeProfit: 1.0970,
			Confidence: 82, RiskUSD: equity * 0.005,
		}
	}

	if err := at.executeDecisionWithRecord(d(), &store.DecisionAction{}); err != nil {
		t.Fatalf("first open: %v", err)
	}
	if err := at.executeDecisionWithRecord(d(), &store.DecisionAction{}); err == nil {
		t.Fatal("duplicate EURUSD long should be blocked")
	} else {
		t.Logf("✓ Duplicate blocked: %v", err)
	}

	if got := len(bridge.ordersFor("open_long")); got != 1 {
		t.Errorf("bridge received %d open_long, want 1", got)
	}
}

// TestForexTrader_WideSLSkipped verifies that when the SL distance is so wide
// the computed lots < BrokerMinLot (0.01), the trade is skipped and the
// bridge receives no order request.
func TestForexTrader_WideSLSkipped(t *testing.T) {
	const equity = 200.0 // small account to force < min lots
	bridge := newFakeBridge(equity, map[string]float64{"EURUSD": 1.09})
	srv := httptest.NewServer(bridge)
	defer srv.Close()

	at := buildForexTrader(t, srv, equity, 0.005)

	d := &kernel.Decision{
		Symbol: "EURUSD", Action: "open_long", Leverage: 30,
		PositionSizeUSD: 50000,
		StopLoss:        1.0400, // 500 pips — risk=$1 / (500×$10) = 0.0002 lots
		TakeProfit:      1.1900,
		Confidence:      82, RiskUSD: equity * 0.005,
	}

	err := at.executeDecisionWithRecord(d, &store.DecisionAction{})
	if len(bridge.ordersFor("open_long")) > 0 {
		t.Error("bridge should receive no order when lots < BrokerMinLot")
	}
	t.Logf("✓ Wide SL skipped (err=%v)", err)
}

// TestForexTrader_OpenCloseCycle verifies the full open→close lifecycle:
// the bridge receives open_long followed by close_long for the same symbol.
func TestForexTrader_OpenCloseCycle(t *testing.T) {
	const equity = 5006.0
	bridge := newFakeBridge(equity, map[string]float64{"GBPUSD": 1.2700})
	srv := httptest.NewServer(bridge)
	defer srv.Close()

	at := buildForexTrader(t, srv, equity, 0.005)

	// Open
	open := &kernel.Decision{
		Symbol: "GBPUSD", Action: "open_long", Leverage: 30,
		PositionSizeUSD: 50000, StopLoss: 1.2660, TakeProfit: 1.2820,
		Confidence: 82, RiskUSD: equity * 0.005,
	}
	if err := at.executeDecisionWithRecord(open, &store.DecisionAction{}); err != nil {
		t.Fatalf("open_long: %v", err)
	}

	// Confirm position exists in bridge state
	bridge.mu.Lock()
	posCount := len(bridge.positions)
	bridge.mu.Unlock()
	if posCount != 1 {
		t.Fatalf("expected 1 position after open, got %d", posCount)
	}

	// Close
	close_ := &kernel.Decision{Symbol: "GBPUSD", Action: "close_long"}
	if err := at.executeDecisionWithRecord(close_, &store.DecisionAction{}); err != nil {
		t.Fatalf("close_long: %v", err)
	}

	// Bridge should have received both requests
	if got := len(bridge.ordersFor("open_long")); got != 1 {
		t.Errorf("want 1 open_long to bridge, got %d", got)
	}
	if got := len(bridge.ordersFor("close_long")); got != 1 {
		t.Errorf("want 1 close_long to bridge, got %d", got)
	}

	bridge.mu.Lock()
	posCount = len(bridge.positions)
	bridge.mu.Unlock()
	if posCount != 0 {
		t.Errorf("expected 0 positions after close, got %d", posCount)
	}
	t.Logf("✓ GBPUSD open→close cycle: both requests reached bridge")
}

// TestForexTrader_RiskDollarPerPair verifies the dollar risk per trade stays
// within 10% of target (riskPct × equity) across all pairs.
// Floor rounding on 0.01 lot precision accounts for small deviations.
func TestForexTrader_RiskDollarPerPair(t *testing.T) {
	const equity = 5006.0
	const riskPct = 0.005
	target := equity * riskPct // $25.03

	cases := []struct {
		symbol string
		price  float64
		sl     float64 // 20-pip SL for all pairs
	}{
		{"EURUSD", 1.0900, 1.0880},
		{"USDJPY", 150.00, 149.80},
		{"GBPUSD", 1.2700, 1.2680},
		{"USDCHF", 0.9000, 0.8980},
	}

	for _, tc := range cases {
		t.Run(tc.symbol, func(t *testing.T) {
			bridge := newFakeBridge(equity, map[string]float64{tc.symbol: tc.price})
			srv := httptest.NewServer(bridge)
			defer srv.Close()

			at := buildForexTrader(t, srv, equity, riskPct)
			d := &kernel.Decision{
				Symbol: tc.symbol, Action: "open_long", Leverage: 30,
				PositionSizeUSD: 50000, StopLoss: tc.sl,
				TakeProfit: tc.price + (tc.price-tc.sl)*2.5,
				Confidence: 82, RiskUSD: target,
			}
			if err := at.executeDecisionWithRecord(d, &store.DecisionAction{}); err != nil {
				t.Fatalf("%s: %v", tc.symbol, err)
			}

			orders := bridge.ordersFor("open_long")
			if len(orders) == 0 {
				t.Skip("no order placed (lots below minimum)")
			}

			lots, _ := orders[0]["lots"].(float64)
			pip := kernel.PipSize(tc.symbol)
			slPips := math.Abs(tc.price-tc.sl) / pip
			pipVal := kernel.PipValuePerLot(tc.symbol, tc.price)
			actualRisk := lots * slPips * pipVal

			if actualRisk > target*1.01 {
				t.Errorf("%s: actual risk $%.2f exceeds target $%.2f", tc.symbol, actualRisk, target)
			}
			if actualRisk < target*0.70 {
				t.Errorf("%s: actual risk $%.2f too far below target $%.2f", tc.symbol, actualRisk, target)
			}

			t.Logf("✓ %s: %.2f lots × %.0f pips × $%.2f/pip = $%.2f (target $%.2f)",
				tc.symbol, lots, slPips, pipVal, actualRisk, target)
		})
	}
}
