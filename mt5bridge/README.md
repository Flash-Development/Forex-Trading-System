# MT5 REST Bridge

A lightweight Python bridge that exposes one or more MetaTrader 5 accounts as a local HTTP API so the FTS Go backend can trade forex (and any other MT5 instrument) without needing a native MT5 SDK.

## Requirements

- Windows machine (or Wine on Linux) with MetaTrader 5 terminal(s) installed and logged in
- Python 3.9+

```
pip install -r requirements.txt
```

## Multi-account setup

Define your accounts in `accounts.json`:

```json
[
  {
    "id": "account1",
    "login": 12345678,
    "password": "your_password",
    "server": "BrokerName-Server",
    "terminal_path": "C:\\Program Files\\MetaTrader 5\\terminal64.exe"
  },
 ,  {
    "id": "Fundednext",
    "login": 33729374,
    "password": "pthGC14##",
    "server": "FundedNext-Server3",
    "terminal_path": "C:\\Program Files\\Fundednext\\terminal64.exe",
    "cent_account": true
  }
]
```

- `id` — arbitrary string used in API routes
- `terminal_path` — optional; omit to let MT5 auto-detect the running terminal
- Each account needs its own MT5 terminal installation and must be logged in before starting the bridge

## Running

```bash
python main.py
# Custom port or config:
MT5_BRIDGE_PORT=8001 python main.py --config accounts.json
```

The router binds to `0.0.0.0:8001` by default. Worker processes bind to `127.0.0.1` on ports starting at `19000` (one per account).

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `MT5_BRIDGE_PORT` | `8001` | Router HTTP port |
| `MT5_ACCOUNTS_CONFIG` | `accounts.json` | Path to accounts config |
| `MT5_WORKER_BASE_PORT` | `19000` | First internal worker port |
| `MT5_WORKER_STARTUP_TIMEOUT` | `30` | Seconds to wait for each worker |

## Configuring FTS

When creating an exchange account in FTS, select **MetaTrader 5** and enter the bridge URL including the account ID:

```
http://localhost:8001/accounts/account1
http://YOUR_VPS_IP:8001/accounts/account2
```

For single-account setups the original URL format still works:

```
http://localhost:8001
```

## API endpoints

### Router

| Method | Path | Description |
|---|---|---|
| GET | `/accounts` | List all accounts + live status |

### Per-account (replace `{id}` with your account id)

| Method | Path | Description |
|---|---|---|
| GET | `/accounts/{id}/health` | Connection check |
| GET | `/accounts/{id}/balance` | Account equity / balance |
| GET | `/accounts/{id}/positions` | Open positions |
| POST | `/accounts/{id}/order` | Place market order |
| POST | `/accounts/{id}/stop_loss` | Set stop loss |
| POST | `/accounts/{id}/take_profit` | Set take profit |
| DELETE | `/accounts/{id}/orders/{symbol}` | Cancel pending orders |
| GET | `/accounts/{id}/orders/{symbol}` | List pending orders |
| GET | `/accounts/{id}/price/{symbol}` | Current bid/ask/mid |
| GET | `/accounts/{id}/klines/{symbol}?interval=5m&limit=100` | OHLCV kline bars |
| GET | `/accounts/{id}/history` | Closed deal history |

Legacy single-account routes (`/health`, `/balance`, etc.) remain available when only one account is configured.

## Architecture

```
                    ┌─────────────────────────────┐
  FTS Go backend   │   main.py  (router :8001)   │
  ───────────────►  │   httpx proxy per account   │
                    └──────┬──────────┬────────────┘
                           │          │
               ┌───────────▼──┐  ┌───▼───────────┐
               │ worker.py    │  │ worker.py      │
               │ account1     │  │ account2       │
               │ :19000       │  │ :19001         │
               └──────┬───────┘  └───────┬────────┘
                      │                  │
               ┌──────▼───────┐  ┌───────▼────────┐
               │  MT5 terminal│  │  MT5 terminal  │
               │  account1    │  │  account2      │
               └──────────────┘  └────────────────┘
```

Each worker is an isolated Python process with its own MT5 connection (required because the MetaTrader5 Python package supports only one connection per process).

## Symbol format

Use standard MT5 symbol names: `EURUSD`, `GBPJPY`, `XAUUSD`, `US500`, etc.

## Position sizing

The bridge converts USD notional amounts to lots automatically:

```
lots = usd_amount / (contract_size × current_price)
```

Lot size is clamped to the broker's `volume_min` / `volume_max` / `volume_step`.
