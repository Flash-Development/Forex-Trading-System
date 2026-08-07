package market

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	nofxConfig "nofx/config"
	"strings"
	"time"
)

const (
	binanceFuturesKlinesURL = "https://fapi.binance.com/fapi/v1/klines"
	binanceMaxKlineLimit    = 1500
)

// GetKlinesRange fetches K-line series within specified time range (closed interval), returns data sorted by time in ascending order.
func GetKlinesRange(symbol string, timeframe string, start, end time.Time) ([]Kline, error) {
	symbol = Normalize(symbol)
	normTF, err := NormalizeTimeframe(timeframe)
	if err != nil {
		return nil, err
	}
	if !end.After(start) {
		return nil, fmt.Errorf("end time must be after start time")
	}

	startMs := start.UnixMilli()
	endMs := end.UnixMilli()

	var all []Kline
	cursor := startMs

	client := &http.Client{Timeout: 15 * time.Second}

	for cursor < endMs {
		req, err := http.NewRequest("GET", binanceFuturesKlinesURL, nil)
		if err != nil {
			return nil, err
		}

		q := req.URL.Query()
		q.Set("symbol", symbol)
		q.Set("interval", normTF)
		q.Set("limit", fmt.Sprintf("%d", binanceMaxKlineLimit))
		q.Set("startTime", fmt.Sprintf("%d", cursor))
		q.Set("endTime", fmt.Sprintf("%d", endMs))
		req.URL.RawQuery = q.Encode()

		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("binance klines api returned status %d: %s", resp.StatusCode, string(body))
		}

		var raw [][]interface{}
		if err := json.Unmarshal(body, &raw); err != nil {
			return nil, err
		}
		if len(raw) == 0 {
			break
		}

		batch := make([]Kline, len(raw))
		for i, item := range raw {
			openTime := int64(item[0].(float64))
			open, _ := parseFloat(item[1])
			high, _ := parseFloat(item[2])
			low, _ := parseFloat(item[3])
			close, _ := parseFloat(item[4])
			volume, _ := parseFloat(item[5])
			closeTime := int64(item[6].(float64))

			batch[i] = Kline{
				OpenTime:  openTime,
				Open:      open,
				High:      high,
				Low:       low,
				Close:     close,
				Volume:    volume,
				CloseTime: closeTime,
			}
		}

		all = append(all, batch...)

		if len(batch) == 0 {
			break
		}
		last := batch[len(batch)-1]
		cursor = last.CloseTime + 1

		// If returned quantity is less than request limit, reached the end, can exit early.
		if len(batch) < binanceMaxKlineLimit {
			break
		}
	}

	return all, nil
}

// GetKlinesForBacktest fetches the most recent `limit` bars for a symbol/timeframe.
// For forex symbols (no USD suffix) it attempts the MT5 bridge first, then falls
// back to Binance futures data for crypto pairs.
func GetKlinesForBacktest(symbol, timeframe string, limit int) ([]Kline, error) {
	if limit <= 0 {
		limit = 500
	}
	if limit > 2000 {
		limit = 2000
	}

	normTF, err := NormalizeTimeframe(timeframe)
	if err != nil {
		normTF = "1h"
	}

	// For forex/commodity symbols, try the MT5 bridge
	if IsForexSymbol(symbol) {
		cfg := nofxConfig.Get()
		bridgeURL := cfg.MT5BridgeURL

		// If legacy URL not set, try the first account in multi-account config
		if bridgeURL == "" && len(cfg.MT5BridgeAccounts) > 0 {
			parts := strings.Split(cfg.MT5BridgeAccounts[0], "=")
			if len(parts) == 2 {
				bridgeURL = parts[1]
			}
		}

		if bridgeURL != "" {
			return getKlinesFromMT5Bridge(bridgeURL, symbol, timeframe, limit)
		}
		return nil, fmt.Errorf("forex backtest data for %s requires a configured MT5 bridge (MT5_BRIDGE_URL or MT5_BRIDGE_ACCOUNTS)", symbol)
	}

	// For crypto pairs (ending in USD) use Binance futures
	sym := Normalize(symbol)
	if len(sym) >= 6 && (strings.HasSuffix(sym, "USD") || strings.HasSuffix(sym, "USDT")) {
		end := time.Now()
		dur := timeframeDuration(normTF)
		start := end.Add(-dur * time.Duration(limit+10))
		klines, err := GetKlinesRange(sym, normTF, start, end)
		if err != nil {
			return nil, err
		}
		if len(klines) > limit {
			klines = klines[len(klines)-limit:]
		}
		return klines, nil
	}

	return nil, fmt.Errorf("no backtest data source available for symbol: %s", symbol)
}

// GetKlinesFromMT5BridgeForBacktest fetches bars directly from a specific MT5 bridge URL.
// This is used when the caller provides an explicit bridge URL override (e.g. from the strategy page).
func GetKlinesFromMT5BridgeForBacktest(bridgeURL, symbol, timeframe string, limit int) ([]Kline, error) {
	if limit <= 0 {
		limit = 500
	}
	if limit > 2000 {
		limit = 2000
	}
	return getKlinesFromMT5Bridge(bridgeURL, symbol, timeframe, limit)
}
func timeframeDuration(tf string) time.Duration {
	switch tf {
	case "1m":
		return time.Minute
	case "3m":
		return 3 * time.Minute
	case "5m":
		return 5 * time.Minute
	case "15m":
		return 15 * time.Minute
	case "30m":
		return 30 * time.Minute
	case "1h":
		return time.Hour
	case "2h":
		return 2 * time.Hour
	case "4h":
		return 4 * time.Hour
	case "6h":
		return 6 * time.Hour
	case "8h":
		return 8 * time.Hour
	case "12h":
		return 12 * time.Hour
	case "1d":
		return 24 * time.Hour
	case "3d":
		return 72 * time.Hour
	case "1w":
		return 7 * 24 * time.Hour
	default:
		return time.Hour
	}
}

// CalculateTimeframeSeriesExported is the exported wrapper around the internal
// calculateTimeframeSeries function so the kernel package can use it for building
// MTF snapshots from pre-fetched kline slices.
func CalculateTimeframeSeriesExported(klines []Kline, timeframe string, count int) *TimeframeSeriesData {
	return calculateTimeframeSeries(klines, timeframe, count)
}
