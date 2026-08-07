# AI Trade Decision Flow

This document explains exactly how the system decides to open a position — every step, every piece of data, and every check that must pass.

---

## Overview

Every N minutes (configurable `scan_interval`) the system runs one cycle. The cycle has 8 stages:

```
1. Build context  →  2. Call AI  →  3. Validate decisions  →  4. Apply risk controls
      ↓                                                               ↓
  [account + positions + market data + indicators]           5. Calculate lot size
                                                                      ↓
                                                           6. Submit order to broker
                                                                      ↓
                                                           7. Set SL / TP
                                                                      ↓
                                                           8. Record trade
```

---

## Stage 1 — Build Trading Context

Before the AI sees anything, the system collects:

### Account data (from broker API)
| Field | Meaning |
|-------|---------|
| `total_equity` | Wallet balance + unrealized PnL |
| `available_balance` | Free cash for new trades |
| `unrealized_pnl` | Floating profit/loss on open positions |
| `margin_used_pct` | % of equity locked as margin |
| `position_count` | How many positions are open |

### Open positions (from broker API)
For each open trade:
- Symbol, side (long/short), entry price, current price
- Quantity, leverage, unrealized PnL %
- Peak PnL % (highest PnL ever reached on this position)
- Liquidation price, margin used
- Time the position was opened

### Market data (from MT5 bridge / exchange API)
For each candidate pair the engine fetches:

| Data | Detail |
|------|--------|
| OHLCV candles | Multiple timeframes: 15m, 1h, 4h (configurable) |
| EMA 20 / 50 | Trend direction |
| MACD | Momentum |
| RSI 7 / 14 | Overbought / oversold |
| ATR 14 | Volatility — used to set stop distance |
| Bollinger Bands | Optional |
| Volume | Confirms breakouts |

For forex/MT5, kline data is fetched from the MT5 bridge (not CoinAnk). The bridge returns real broker prices.

### Recent trade history (from database)
Last 10 closed trades with entry/exit price, PnL, hold time — so the AI can learn from recent performance.

### Trading statistics (from database)
Win rate, profit factor, Sharpe ratio, average win/loss, max drawdown — the AI uses this to calibrate risk.

---

## Stage 2 — Build the AI Prompt

Two prompts are sent to the AI:

### System Prompt (instructions — fixed per strategy)
Contains:
- Role definition (institutional forex trader persona)
- Hard constraints (max positions, max margin, min position size)
- AI-guided constraints (max leverage, min R:R ratio, min confidence)
- Position sizing instructions (0.7% risk per trade, formula explained)
- Session rules (only London / NY session)
- Entry standards (3-timeframe confluence required)
- Output format (XML + JSON)

### User Prompt (data — changes every cycle)
Contains:
- Current timestamp and cycle number
- Account snapshot (equity, balance, margin, PnL)
- Open positions with full market data for each
- Candidate pairs with full market data for each
- Recent closed trades
- Historical stats (win rate, profit factor, etc.)

**Example of what the AI sees for a candidate pair:**

```
=== USDJPY Market Data ===

current_price = 163.4200, current_ema20 = 163.180, current_macd = 0.142, current_rsi7 = 58.3

=== 15M Timeframe (oldest → latest) ===

Time(UTC)      Open      High      Low       Close     Volume
07-28 08:00   163.2100  163.3500  163.1800  163.2900  1842.00
07-28 08:15   163.2900  163.4500  163.2700  163.4100  2103.00
07-28 08:30   163.4100  163.4800  163.3900  163.4200  1956.00  <- current

EMA20: [163.05, 163.08, 163.12, 163.18]
EMA50: [162.94, 162.97, 163.01, 163.06]
MACD: [0.089, 0.107, 0.129, 0.142]
RSI14: [52.1, 54.3, 56.8, 58.3]
ATR14: 0.1420

=== 1H Timeframe (oldest → latest) ===
...
=== 4H Timeframe (oldest → latest) ===
...
```

---

## Stage 3 — AI Makes the Decision

The AI reads all the data, writes a chain-of-thought analysis, then outputs a JSON decision:

```xml
<reasoning>
USDJPY: Price is above EMA20 and EMA50 on 4H — bullish structure.
1H MACD histogram turning positive. RSI(14) crossed above 50.
15M shows a clean pullback to EMA20 support, RSI(7) at 58 — not overbought.
Currently London session (08:30 UTC). Setup meets all 3-timeframe criteria.
ATR14 = 0.142 → SL = 163.42 - (1.5 × 0.142) = 163.21 (21.3 pips)
TP = 163.42 + (2.5 × 21.3 pips) = 163.95
R:R = 2.5:1 ✓  Confidence: 82 ✓
risk_usd = 0.7% × 5006 = $35.04
</reasoning>

<decision>
```json
[
  {
    "symbol": "USDJPY",
    "action": "open_long",
    "leverage": 30,
    "position_size_usd": 150000,
    "stop_loss": 163.21,
    "take_profit": 163.95,
    "confidence": 82,
    "risk_usd": 35.04,
    "reasoning": "4H bullish structure + 1H momentum + 15M pullback entry. London session."
  }
]
```
</decision>
```

The required fields for any `open_long` / `open_short`:

| Field | Required | Description |
|-------|----------|-------------|
| `symbol` | ✓ | Pair to trade |
| `action` | ✓ | `open_long`, `open_short`, `close_long`, `close_short`, `hold`, `wait` |
| `leverage` | ✓ | Must be ≤ configured max |
| `position_size_usd` | ✓ | Notional position value |
| `stop_loss` | ✓ | Actual price level (not pips) |
| `take_profit` | ✓ | Actual price level (not pips) |
| `confidence` | ✓ | Must be ≥ configured minimum (78) |
| `risk_usd` | ✓ | Dollar amount at risk (used for lot sizing) |

---

## Stage 4 — Validate the Decision

The backend validates every decision before execution:

| Check | Rule |
|-------|------|
| Max positions | Reject if already at limit (default: 3) |
| No duplicate | Reject if same symbol+side already open |
| Leverage cap | Auto-reduce to configured max if exceeded |
| Min position size | Reject if `position_size_usd` < $12 |
| Min R:R ratio | Reject if R:R < 2.5 |
| Min confidence | Reject if < 78 |
| SL/TP validity | Long: SL < entry < TP; Short: SL > entry > TP |
| Session filter | Reject if outside London / NY session (forex) |

---

## Stage 5 — Calculate Lot Size

This is where `risk_usd` and `stop_loss` are used to derive the actual lot size. The AI's `position_size_usd` is ignored for forex — the risk engine overrides it.

```
slPips  = abs(stop_loss - current_price) / pip_size
pipVal  = PipValuePerLot(symbol, current_price)   ← see pip-value-per-lot.md
lots    = floor((risk_usd / (slPips × pipVal)) × 100) / 100
```

### Worked example per pair ($5,006 equity, 0.7% risk = $35.04)

| Pair | Price | SL | SL pips | Pip value/lot | Lots | Actual risk |
|------|-------|----|---------|--------------|------|-------------|
| USDJPY | 163.42 | 163.21 | 21 pips | $6.13 | 0.27 | $34.74 |
| GBPUSD | 1.3350 | 1.3320 | 30 pips | $10.00 | 0.11 | $33.00 |
| EURUSD | 1.1410 | 1.1385 | 25 pips | $10.00 | 0.14 | $35.00 |
| EURGBP | 0.8500 | 0.8475 | 25 pips | $12.70 | 0.11 | $34.93 |
| USDCHF | 0.9000 | 0.8975 | 25 pips | $11.11 | 0.12 | $33.33 |
| XAUUSD | 2300 | 2285 | 1500 pips | $1.00 | 0.02 | $30.00 |

Each trade risks approximately $35 regardless of the pair — the lot size scales up/down automatically based on the pair's pip value.

---

## Stage 6 — Submit Order

The lot size is sent to the MT5 broker via the bridge:

```
POST /order
{
  "symbol": "USDJPY",
  "action": "open_long",
  "lots": 0.27,
  "leverage": 30
}
```

The broker executes a market order at the current ask price.

---

## Stage 7 — Set Stop Loss and Take Profit

After the order fills, two separate requests set the SL and TP at the price levels the AI specified:

```
SetStopLoss("USDJPY", "LONG", 0.27 lots, 163.21)
SetTakeProfit("USDJPY", "LONG", 0.27 lots, 163.95)
```

These appear on the MT5 chart as the bracket lines you see in the screenshot.

---

## Stage 8 — Record the Trade

The trade is saved to the local database:
- Order ID, symbol, side, quantity, entry price, leverage
- SL / TP levels
- Timestamp

This feeds back into Stage 1 on the next cycle — the AI will see this position in its context.

---

## What Can Block a Trade

In order of when they fire:

1. `stopUntil` timer — risk control paused trading after a loss
2. Safe mode — AI failed 3+ times in a row, no new opens allowed
3. Session filter — outside London/NY hours
4. Max positions check — already at limit
5. Duplicate position check — already long/short this pair
6. Leverage cap — auto-reduced, not blocked
7. Min confidence — AI returned < 78
8. Min R:R ratio — AI returned < 2.5
9. Min position size — < $12
10. Lot size below broker minimum — SL too wide → rounds down to 0 lots → skipped

---

## Entry Requirements Summary

For an `open_long` or `open_short` to execute, **all** of the following must be true:

- [ ] London or New York session is active
- [ ] Fewer than 3 positions currently open
- [ ] No existing position on the same symbol+side
- [ ] 4H trend aligned (EMA20 > EMA50 for long, < for short)
- [ ] 1H momentum confirmed (MACD or RSI cross)
- [ ] 15M entry trigger present
- [ ] Confidence ≥ 78
- [ ] R:R ≥ 2.5
- [ ] SL is valid (price level, not zero)
- [ ] Calculated lots ≥ 0.01 (broker minimum)
- [ ] AI not in safe mode
