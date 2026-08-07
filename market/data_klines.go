package market

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"nofx/logger"
	"nofx/provider/coinank/coinank_api"
	"nofx/provider/coinank/coinank_enum"
	"nofx/provider/hyperliquid"
	"strconv"
	"strings"
	"time"
)

// Note: Kline data now uses free/open API (coinank_api.Kline) which doesn't require authentication

// getKlinesFromCoinAnk fetches kline data from CoinAnk API (replacement for WSMonitorCli)
func getKlinesFromCoinAnk(symbol, interval, exchange string, limit int) ([]Kline, error) {
	// Map interval string to coinank enum
	var coinankInterval coinank_enum.Interval
	switch interval {
	case "1m":
		coinankInterval = coinank_enum.Minute1
	case "3m":
		coinankInterval = coinank_enum.Minute3
	case "5m":
		coinankInterval = coinank_enum.Minute5
	case "15m":
		coinankInterval = coinank_enum.Minute15
	case "30m":
		coinankInterval = coinank_enum.Minute30
	case "1h":
		coinankInterval = coinank_enum.Hour1
	case "2h":
		coinankInterval = coinank_enum.Hour2
	case "4h":
		coinankInterval = coinank_enum.Hour4
	case "6h":
		coinankInterval = coinank_enum.Hour6
	case "8h":
		coinankInterval = coinank_enum.Hour8
	case "12h":
		coinankInterval = coinank_enum.Hour12
	case "1d":
		coinankInterval = coinank_enum.Day1
	case "3d":
		coinankInterval = coinank_enum.Day3
	case "1w":
		coinankInterval = coinank_enum.Week1
	default:
		return nil, fmt.Errorf("unsupported interval: %s", interval)
	}

	// Map exchange string to coinank enum
	var coinankExchange coinank_enum.Exchange
	switch strings.ToLower(exchange) {
	case "binance":
		coinankExchange = coinank_enum.Binance
	case "bybit":
		coinankExchange = coinank_enum.Bybit
	case "okx":
		coinankExchange = coinank_enum.Okex
	case "bitget":
		coinankExchange = coinank_enum.Bitget
	case "gate":
		coinankExchange = coinank_enum.Gate
	case "hyperliquid":
		coinankExchange = coinank_enum.Hyperliquid
	case "aster":
		coinankExchange = coinank_enum.Aster
	default:
		// Default to Binance for unknown exchanges
		coinankExchange = coinank_enum.Binance
	}

	// Call CoinAnk free/open API (no authentication required)
	ctx := context.Background()
	ts := time.Now().UnixMilli()
	// Use "To" side to search backward from current time (get historical klines)
	coinankKlines, err := coinank_api.Kline(ctx, symbol, coinankExchange, ts, coinank_enum.To, limit, coinankInterval)
	if err != nil || len(coinankKlines) == 0 {
		// CoinAnk failed — fall back to Binance direct API
		if err != nil {
			logger.Warnf("⚠️ CoinAnk %s data failed (%v), falling back to Binance direct API", exchange, err)
		} else {
			logger.Warnf("⚠️ CoinAnk %s %s data empty for %s, falling back to Binance direct API", exchange, interval, symbol)
		}
		return getKlinesFromBinanceDirect(symbol, interval, limit)
	}

	// Convert coinank kline format to market.Kline format
	klines := make([]Kline, len(coinankKlines))
	for i, ck := range coinankKlines {
		klines[i] = Kline{
			OpenTime:  ck.StartTime,
			Open:      ck.Open,
			High:      ck.High,
			Low:       ck.Low,
			Close:     ck.Close,
			Volume:    ck.Volume,
			CloseTime: ck.EndTime,
		}
	}

	return klines, nil
}

// getKlinesFromBinanceDirect fetches klines from Binance public REST API (no auth required).
// Used as a fallback when CoinAnk is unavailable.
func getKlinesFromBinanceDirect(symbol, interval string, limit int) ([]Kline, error) {
	if limit > 1500 {
		limit = 1500
	}
	url := fmt.Sprintf("https://fapi.binance.com/fapi/v1/klines?symbol=%s&interval=%s&limit=%d", symbol, interval, limit)
	httpClient := &http.Client{Timeout: 10 * time.Second}
	resp, err := httpClient.Get(url)
	if err != nil {
		// Try spot API as secondary fallback
		url = fmt.Sprintf("https://api.binance.com/api/v3/klines?symbol=%s&interval=%s&limit=%d", symbol, interval, limit)
		resp, err = httpClient.Get(url)
		if err != nil {
			return nil, fmt.Errorf("binance direct API error: %w", err)
		}
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	// Binance returns [[openTime, open, high, low, close, volume, closeTime, ...], ...]
	var raw [][]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("binance direct API parse error: %w", err)
	}
	klines := make([]Kline, 0, len(raw))
	for _, bar := range raw {
		if len(bar) < 7 {
			continue
		}
		openTime := int64(toFloat64(bar[0]))
		closeTime := int64(toFloat64(bar[6]))
		open, _ := strconv.ParseFloat(fmt.Sprintf("%v", bar[1]), 64)
		high, _ := strconv.ParseFloat(fmt.Sprintf("%v", bar[2]), 64)
		low, _ := strconv.ParseFloat(fmt.Sprintf("%v", bar[3]), 64)
		close, _ := strconv.ParseFloat(fmt.Sprintf("%v", bar[4]), 64)
		volume, _ := strconv.ParseFloat(fmt.Sprintf("%v", bar[5]), 64)
		klines = append(klines, Kline{
			OpenTime:  openTime,
			Open:      open,
			High:      high,
			Low:       low,
			Close:     close,
			Volume:    volume,
			CloseTime: closeTime,
		})
	}
	return klines, nil
}


func getKlinesFromHyperliquid(symbol, interval string, limit int) ([]Kline, error) {
	// Remove xyz: prefix if present for the API call
	baseCoin := strings.TrimPrefix(symbol, "xyz:")

	// Map interval to Hyperliquid format
	hlInterval := hyperliquid.MapTimeframe(interval)

	// Create Hyperliquid client
	client := hyperliquid.NewClient()

	// Fetch candles
	ctx := context.Background()
	candles, err := client.GetCandles(ctx, baseCoin, hlInterval, limit)
	if err != nil {
		return nil, fmt.Errorf("Hyperliquid API error: %w", err)
	}

	// Convert to market.Kline format
	klines := make([]Kline, len(candles))
	for i, c := range candles {
		open, _ := strconv.ParseFloat(c.Open, 64)
		high, _ := strconv.ParseFloat(c.High, 64)
		low, _ := strconv.ParseFloat(c.Low, 64)
		closePrice, _ := strconv.ParseFloat(c.Close, 64)
		volume, _ := strconv.ParseFloat(c.Volume, 64)

		klines[i] = Kline{
			OpenTime:  c.OpenTime,
			Open:      open,
			High:      high,
			Low:       low,
			Close:     closePrice,
			Volume:    volume,
			CloseTime: c.CloseTime,
		}
	}

	return klines, nil
}

// calculateTimeframeSeries calculates series data for a single timeframe
func calculateTimeframeSeries(klines []Kline, timeframe string, count int) *TimeframeSeriesData {
	if count <= 0 {
		count = 10 // default
	}

	data := &TimeframeSeriesData{
		Timeframe:    timeframe,
		Klines:       make([]KlineBar, 0, count),
		MidPrices:    make([]float64, 0, count),
		EMA20Values:  make([]float64, 0, count),
		EMA50Values:  make([]float64, 0, count),
		EMA200Values: make([]float64, 0, count),
		MACDValues:   make([]float64, 0, count),
		RSI7Values:   make([]float64, 0, count),
		RSI14Values:  make([]float64, 0, count),
		Volume:       make([]float64, 0, count),
		BOLLUpper:    make([]float64, 0, count),
		BOLLMiddle:   make([]float64, 0, count),
		BOLLLower:    make([]float64, 0, count),
	}

	// Get latest N data points based on count from config
	start := len(klines) - count
	if start < 0 {
		start = 0
	}

	for i := start; i < len(klines); i++ {
		// Store full OHLCV kline data
		data.Klines = append(data.Klines, KlineBar{
			Time:   klines[i].OpenTime,
			Open:   klines[i].Open,
			High:   klines[i].High,
			Low:    klines[i].Low,
			Close:  klines[i].Close,
			Volume: klines[i].Volume,
		})

		// Keep MidPrices and Volume for backward compatibility
		data.MidPrices = append(data.MidPrices, klines[i].Close)
		data.Volume = append(data.Volume, klines[i].Volume)

		// Calculate EMA20 for each point
		if i >= 19 {
			ema20 := calculateEMA(klines[:i+1], 20)
			data.EMA20Values = append(data.EMA20Values, ema20)
		}

		// Calculate EMA50 for each point
		if i >= 49 {
			ema50 := calculateEMA(klines[:i+1], 50)
			data.EMA50Values = append(data.EMA50Values, ema50)
		}

		// Calculate EMA200 for each point
		if i >= 199 {
			ema200 := calculateEMA(klines[:i+1], 200)
			data.EMA200Values = append(data.EMA200Values, ema200)
		}

		// Calculate MACD for each point
		if i >= 25 {
			macd := calculateMACD(klines[:i+1])
			data.MACDValues = append(data.MACDValues, macd)
		}

		// Calculate RSI for each point
		if i >= 7 {
			rsi7 := calculateRSI(klines[:i+1], 7)
			data.RSI7Values = append(data.RSI7Values, rsi7)
		}
		if i >= 14 {
			rsi14 := calculateRSI(klines[:i+1], 14)
			data.RSI14Values = append(data.RSI14Values, rsi14)
		}

		// Calculate Bollinger Bands (period 20, std dev multiplier 2)
		if i >= 19 {
			upper, middle, lower := calculateBOLL(klines[:i+1], 20, 2.0)
			data.BOLLUpper = append(data.BOLLUpper, upper)
			data.BOLLMiddle = append(data.BOLLMiddle, middle)
			data.BOLLLower = append(data.BOLLLower, lower)
		}
	}

	// Calculate ATR14
	data.ATR14 = calculateATR(klines, 14)

	return data
}

// calculatePriceChangeByBars calculates how many K-lines to look back for price change based on timeframe
func calculatePriceChangeByBars(klines []Kline, timeframe string, targetMinutes int) float64 {
	if len(klines) < 2 {
		return 0
	}

	// Parse timeframe to minutes
	tfMinutes := parseTimeframeToMinutes(timeframe)
	if tfMinutes <= 0 {
		return 0
	}

	// Calculate how many K-lines to look back
	barsBack := targetMinutes / tfMinutes
	if barsBack < 1 {
		barsBack = 1
	}

	currentPrice := klines[len(klines)-1].Close
	idx := len(klines) - 1 - barsBack
	if idx < 0 {
		idx = 0
	}

	oldPrice := klines[idx].Close
	if oldPrice > 0 {
		return ((currentPrice - oldPrice) / oldPrice) * 100
	}
	return 0
}

// parseTimeframeToMinutes parses timeframe string to minutes
func parseTimeframeToMinutes(tf string) int {
	switch tf {
	case "1m":
		return 1
	case "3m":
		return 3
	case "5m":
		return 5
	case "15m":
		return 15
	case "30m":
		return 30
	case "1h":
		return 60
	case "2h":
		return 120
	case "4h":
		return 240
	case "6h":
		return 360
	case "8h":
		return 480
	case "12h":
		return 720
	case "1d":
		return 1440
	case "3d":
		return 4320
	case "1w":
		return 10080
	default:
		return 0
	}
}

// calculateIntradaySeries calculates intraday series data
func calculateIntradaySeries(klines []Kline) *IntradayData {
	data := &IntradayData{
		MidPrices:   make([]float64, 0, 10),
		EMA20Values: make([]float64, 0, 10),
		MACDValues:  make([]float64, 0, 10),
		RSI7Values:  make([]float64, 0, 10),
		RSI14Values: make([]float64, 0, 10),
		Volume:      make([]float64, 0, 10),
	}

	// Get latest 10 data points
	start := len(klines) - 10
	if start < 0 {
		start = 0
	}

	for i := start; i < len(klines); i++ {
		data.MidPrices = append(data.MidPrices, klines[i].Close)
		data.Volume = append(data.Volume, klines[i].Volume)

		// Calculate EMA20 for each point
		if i >= 19 {
			ema20 := calculateEMA(klines[:i+1], 20)
			data.EMA20Values = append(data.EMA20Values, ema20)
		}

		// Calculate MACD for each point
		if i >= 25 {
			macd := calculateMACD(klines[:i+1])
			data.MACDValues = append(data.MACDValues, macd)
		}

		// Calculate RSI for each point
		if i >= 7 {
			rsi7 := calculateRSI(klines[:i+1], 7)
			data.RSI7Values = append(data.RSI7Values, rsi7)
		}
		if i >= 14 {
			rsi14 := calculateRSI(klines[:i+1], 14)
			data.RSI14Values = append(data.RSI14Values, rsi14)
		}
	}

	// Calculate 3m ATR14
	data.ATR14 = calculateATR(klines, 14)

	return data
}

// calculateLongerTermData calculates longer-term data
func calculateLongerTermData(klines []Kline) *LongerTermData {
	data := &LongerTermData{
		MACDValues:  make([]float64, 0, 10),
		RSI14Values: make([]float64, 0, 10),
	}

	// Calculate EMA
	data.EMA20 = calculateEMA(klines, 20)
	data.EMA50 = calculateEMA(klines, 50)
	data.EMA200 = calculateEMA(klines, 200)

	// Calculate ATR
	data.ATR3 = calculateATR(klines, 3)
	data.ATR14 = calculateATR(klines, 14)

	// Calculate volume
	if len(klines) > 0 {
		data.CurrentVolume = klines[len(klines)-1].Volume
		// Calculate average volume
		sum := 0.0
		for _, k := range klines {
			sum += k.Volume
		}
		data.AverageVolume = sum / float64(len(klines))
	}

	// Calculate MACD and RSI series
	start := len(klines) - 10
	if start < 0 {
		start = 0
	}

	for i := start; i < len(klines); i++ {
		if i >= 25 {
			macd := calculateMACD(klines[:i+1])
			data.MACDValues = append(data.MACDValues, macd)
		}
		if i >= 14 {
			rsi14 := calculateRSI(klines[:i+1], 14)
			data.RSI14Values = append(data.RSI14Values, rsi14)
		}
	}

	return data
}

// GetBoxData fetches 1h klines and calculates box data for a symbol
func GetBoxData(symbol string) (*BoxData, error) {
	symbol = Normalize(symbol)

	// Fetch 500 1h klines
	var klines []Kline
	var err error

	if IsXyzDexAsset(symbol) {
		klines, err = getKlinesFromHyperliquid(symbol, "1h", LongBoxPeriod)
	} else {
		klines, err = getKlinesFromCoinAnk(symbol, "1h", "binance", LongBoxPeriod)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to get 1h klines: %w", err)
	}

	if len(klines) == 0 {
		return nil, fmt.Errorf("no kline data available")
	}

	currentPrice := klines[len(klines)-1].Close

	return calculateBoxData(klines, currentPrice), nil
}

// getKlinesFromMT5Bridge fetches OHLCV klines from the MT5 REST bridge.
//
// The bridge's /history endpoint returns closed deals, not candles. Instead we
// use the /price endpoint for the current tick and synthesise candles from the
// deal history. For proper OHLCV bars we call a dedicated /klines endpoint that
// we add to the bridge worker — but as a fallback we build synthetic 1-bar data
// from the current price so the engine always has something to work with.
//
// bridgeURL  — e.g. "http://localhost:8001/accounts/FundedNext"
// symbol     — MT5 symbol, e.g. "EURUSD", "XAUUSD"
// interval   — timeframe string, e.g. "5m", "1h"
// limit      — number of bars requested
// GetKlinesFromMT5Bridge is the exported version of getKlinesFromMT5Bridge.
func GetKlinesFromMT5Bridge(bridgeURL, symbol, interval string, limit int) ([]Kline, error) {
	return getKlinesFromMT5Bridge(bridgeURL, symbol, interval, limit)
}

func getKlinesFromMT5Bridge(bridgeURL, symbol, interval string, limit int) ([]Kline, error) {
	bridgeURL = strings.TrimRight(bridgeURL, "/")

	// Map interval to minutes for the history window
	minutes := parseTimeframeToMinutes(interval)
	if minutes <= 0 {
		minutes = 5
	}
	hoursNeeded := (minutes * limit / 60) + 1
	if hoursNeeded < 1 {
		hoursNeeded = 1
	}

	// Try /klines endpoint first (added to bridge worker)
	klinesURL := fmt.Sprintf("%s/klines/%s?interval=%s&limit=%d", bridgeURL, symbol, interval, limit)
	client := &http.Client{Timeout: 15 * time.Second}

	resp, err := client.Get(klinesURL)
	if err == nil && resp.StatusCode == 200 {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)

		var raw []map[string]interface{}
		if json.Unmarshal(body, &raw) == nil && len(raw) > 0 {
			klines := make([]Kline, 0, len(raw))
			for _, bar := range raw {
				openTime := int64(toFloat64(bar["time"]))
				klines = append(klines, Kline{
					OpenTime:  openTime,
					Open:      toFloat64(bar["open"]),
					High:      toFloat64(bar["high"]),
					Low:       toFloat64(bar["low"]),
					Close:     toFloat64(bar["close"]),
					Volume:    toFloat64(bar["volume"]),
					CloseTime: openTime + int64(minutes)*60*1000,
				})
			}
			logger.Infof("📊 [MT5] Fetched %d %s klines for %s from bridge", len(klines), interval, symbol)
			return klines, nil
		}
	}
	if resp != nil {
		resp.Body.Close()
	}

	// Fallback: build synthetic bars from deal history
	logger.Infof("📊 [MT5] /klines not available, building synthetic bars from deal history for %s", symbol)
	histURL := fmt.Sprintf("%s/history?hours=%d&limit=%d", bridgeURL, hoursNeeded, limit*10)
	resp2, err := client.Get(histURL)
	if err != nil {
		// Last resort: single bar from current price
		return mt5SingleBarFromPrice(client, bridgeURL, symbol, minutes)
	}
	defer resp2.Body.Close()
	body2, _ := io.ReadAll(resp2.Body)

	var deals []map[string]interface{}
	if err := json.Unmarshal(body2, &deals); err != nil || len(deals) == 0 {
		return mt5SingleBarFromPrice(client, bridgeURL, symbol, minutes)
	}

	// Bucket deals into candles
	klines := bucketDealsToKlines(deals, minutes, limit)
	if len(klines) == 0 {
		return mt5SingleBarFromPrice(client, bridgeURL, symbol, minutes)
	}
	return klines, nil
}

// mt5SingleBarFromPrice builds a single synthetic kline from the current MT5 price tick.
func mt5SingleBarFromPrice(client *http.Client, bridgeURL, symbol string, intervalMinutes int) ([]Kline, error) {
	priceURL := fmt.Sprintf("%s/price/%s", bridgeURL, symbol)
	resp, err := client.Get(priceURL)
	if err != nil {
		return nil, fmt.Errorf("MT5 bridge price fetch failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var tick map[string]interface{}
	if err := json.Unmarshal(body, &tick); err != nil {
		return nil, fmt.Errorf("MT5 bridge price parse failed: %w", err)
	}

	mid := toFloat64(tick["mid"])
	if mid == 0 {
		mid = toFloat64(tick["ask"])
	}
	now := time.Now().UnixMilli()
	k := Kline{
		OpenTime:  now - int64(intervalMinutes)*60*1000,
		Open:      mid,
		High:      mid,
		Low:       mid,
		Close:     mid,
		Volume:    0,
		CloseTime: now,
	}
	return []Kline{k}, nil
}

// bucketDealsToKlines groups MT5 deal history into OHLCV candles.
func bucketDealsToKlines(deals []map[string]interface{}, intervalMinutes, limit int) []Kline {
	if len(deals) == 0 {
		return nil
	}
	bucketMs := int64(intervalMinutes) * 60 * 1000
	type bucket struct {
		open, high, low, close, volume float64
		openTime                       int64
	}
	buckets := make(map[int64]*bucket)

	for _, d := range deals {
		price := toFloat64(d["price"])
		vol := toFloat64(d["volume"])
		ts := int64(toFloat64(d["time_msc"]))
		if ts == 0 {
			ts = int64(toFloat64(d["time"])) * 1000
		}
		if price == 0 || ts == 0 {
			continue
		}
		key := (ts / bucketMs) * bucketMs
		b, ok := buckets[key]
		if !ok {
			b = &bucket{open: price, high: price, low: price, close: price, openTime: key}
			buckets[key] = b
		}
		if price > b.high {
			b.high = price
		}
		if price < b.low {
			b.low = price
		}
		b.close = price
		b.volume += vol
	}

	klines := make([]Kline, 0, len(buckets))
	for key, b := range buckets {
		klines = append(klines, Kline{
			OpenTime:  key,
			Open:      b.open,
			High:      b.high,
			Low:       b.low,
			Close:     b.close,
			Volume:    b.volume,
			CloseTime: key + bucketMs,
		})
	}

	// Sort by time
	for i := 1; i < len(klines); i++ {
		for j := i; j > 0 && klines[j].OpenTime < klines[j-1].OpenTime; j-- {
			klines[j], klines[j-1] = klines[j-1], klines[j]
		}
	}

	if len(klines) > limit {
		klines = klines[len(klines)-limit:]
	}
	return klines
}

// toFloat64 safely converts interface{} to float64 (local helper for data_klines.go).
func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	}
	return 0
}
