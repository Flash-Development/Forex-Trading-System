package kernel

import (
	"testing"
	"time"
)

func TestRunBacktest(t *testing.T) {
	now := time.Now()
	bars := []BacktestBar{
		{Time: now.Add(0 * time.Hour), Open: 1.0, High: 1.1, Low: 0.9, Close: 1.05},
		{Time: now.Add(1 * time.Hour), Open: 1.05, High: 1.2, Low: 1.0, Close: 1.15},
		{Time: now.Add(2 * time.Hour), Open: 1.15, High: 1.3, Low: 1.1, Close: 1.25},
		{Time: now.Add(3 * time.Hour), Open: 1.25, High: 1.4, Low: 1.2, Close: 1.35},
		{Time: now.Add(4 * time.Hour), Open: 1.35, High: 1.5, Low: 1.3, Close: 1.45},
	}

	signals := []BacktestSignal{
		{
			Time:       now.Add(0 * time.Hour),
			Symbol:     "EURUSD",
			Side:       "long",
			EntryPrice: 1.05,
			StopLoss:   0.9,
			TakeProfit: 1.2,
		},
	}

	cfg := BacktestConfig{
		Symbol:          "EURUSD",
		InitialEquity:   10000,
		RiskPctPerTrade: 0.01,
	}

	result := RunBacktest(cfg, signals, bars)

	if len(result.Trades) != 1 {
		t.Errorf("expected 1 trade, got %d", len(result.Trades))
	}

	trade := result.Trades[0]
	// Exit should be at 1.2 (TP hit in second bar)
	if trade.ExitPrice != 1.2 {
		t.Errorf("expected exit price 1.2, got %f", trade.ExitPrice)
	}

	if !trade.IsWin {
		t.Error("expected trade to be a win")
	}

	if result.TotalTrades != 1 {
		t.Errorf("expected TotalTrades 1, got %d", result.TotalTrades)
	}

	if result.WinRate != 1.0 {
		t.Errorf("expected WinRate 1.0, got %f", result.WinRate)
	}
}

func TestRunBacktest_Loss(t *testing.T) {
	// ... (existing code)
}

func TestEMA(t *testing.T) {
	prices := []float64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	result := EMA(prices, 5)
	if len(result) != len(prices) {
		t.Errorf("expected length %d, got %d", len(prices), len(result))
	}
	if result[4] == 0 {
		t.Error("expected result[4] to be non-zero")
	}
}
