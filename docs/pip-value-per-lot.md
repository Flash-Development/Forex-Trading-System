# PipValuePerLot — How It Works

`PipValuePerLot` answers one question:

> **If price moves 1 pip, how many USD do I make or lose on 1 standard lot (100,000 units)?**

This value is used directly in the position sizing formula:

```
lots = riskUSD / (stopLossPips × pipValuePerLot)
```

If `pipValuePerLot` is wrong, every trade on that pair gets the wrong lot size.

---

## What is a Pip?

A pip is the smallest standard price move for a pair.

| Pair type | Pip size |
|-----------|----------|
| Most pairs (EURUSD, GBPUSD, etc.) | 0.0001 |
| JPY pairs (USDJPY, EURJPY, etc.) | 0.01 |
| Gold (XAUUSD) | 0.01 |
| Silver (XAGUSD) | 0.001 |
| Platinum (XPTUSD) | 0.01 |
| Oil (USOIL, UKOIL) | 0.01 |

---

## Category Breakdown

### 1. USD is the quote currency — EURUSD, GBPUSD, AUDUSD, NZDUSD

Price moves from 1.0900 → 1.0901 = 1 pip.
You hold 100,000 units of the base. Each pip is always worth exactly **$10**.

```
pip value = 0.0001 × 100,000 = $10.00
```

The current price doesn't matter here — it's always $10.

---

### 2. JPY is the quote currency — USDJPY, EURJPY, GBPJPY, AUDJPY, CADJPY, etc.

Price moves from 150.00 → 150.01 = 1 pip.
That pip is worth ¥1,000. To get USD, divide by the current price.

```
pip value = (0.01 × 100,000) / currentPrice
         = 1,000 / 150.0
         = $6.67
```

As USDJPY rises, each pip is worth fewer dollars. The current price is essential.

---

### 3. USD is the base currency — USDCHF, USDCAD

Price moves from 0.9000 → 0.9001 = 1 pip.
That move is 0.0001 × 100,000 = 11.11 CHF. To get USD, divide by the current price.

```
pip value = (0.0001 × 100,000) / currentPrice
         = 10 / 0.9000
         = $11.11
```

---

### 4. Cross pairs — EURGBP, GBPCHF, AUDCAD, EURAUD, NZDCHF, etc.

Neither side is USD. A pip move is denominated in the **quote currency** (GBP, CHF, CAD, AUD).
To convert to USD we need that currency's USD rate — not the pair's own price.

```
EURGBP: pip value = 0.0001 × 100,000 × (GBP→USD ≈ 1.27) = $12.70
AUDCAD: pip value = 0.0001 × 100,000 × (CAD→USD ≈ 0.74) = $7.40
GBPCHF: pip value = 0.0001 × 100,000 × (CHF→USD ≈ 1.12) = $11.20
```

The code uses a static `approxUSDRates` map for this conversion:

```go
var approxUSDRates = map[string]float64{
    "GBP": 1.27,
    "EUR": 1.09,
    "AUD": 0.65,
    "NZD": 0.60,
    "CAD": 0.74,
    "CHF": 1.12,
}
```

These are approximate. The sizing error from rate drift is small and stays within lot rounding tolerance.

---

### 5. Metals and commodities — XAUUSD, XAGUSD, XPTUSD, USOIL, UKOIL

Different contract sizes apply — not 100,000 units.

| Symbol | Contract size | Pip size | Pip value per lot |
|--------|--------------|----------|-------------------|
| XAUUSD | 100 oz | $0.01 | $1.00 |
| XAGUSD | 5,000 oz | $0.001 | $5.00 |
| XPTUSD | 50 oz | $0.01 | $0.50 |
| USOIL | 1,000 bbl | $0.01 | $10.00 |
| UKOIL | 1,000 bbl | $0.01 | $10.00 |

---

## Quick Reference Table

| Pair | Price | Pip value/lot |
|------|-------|--------------|
| EURUSD | 1.09 | $10.00 |
| GBPUSD | 1.27 | $10.00 |
| USDJPY | 150 | $6.67 |
| EURJPY | 163 | $6.13 |
| GBPJPY | 191 | $5.24 |
| USDCHF | 0.90 | $11.11 |
| USDCAD | 1.36 | $7.35 |
| EURGBP | 0.85 | $12.70 |
| AUDCAD | 0.88 | $7.40 |
| GBPCHF | 1.14 | $11.20 |
| XAUUSD | any | $1.00 |
| USOIL | any | $10.00 |

---

## Why This Matters

With a $5,000 account at 0.7% risk:

```
riskUSD = $5,000 × 0.007 = $35
```

On EURUSD with a 20-pip stop:
```
lots = $35 / (20 × $10) = 0.17 lots
```

On USDJPY (price 150) with a 20-pip stop:
```
lots = $35 / (20 × $6.67) = 0.26 lots
```

On EURGBP with a 20-pip stop:
```
lots = $35 / (20 × $12.70) = 0.13 lots
```

Each trade risks exactly $35 regardless of the pair — that's the goal.
