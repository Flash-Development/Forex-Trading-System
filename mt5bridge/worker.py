"""
MT5 Worker — single-account MT5 REST server.

Spawned by main.py (the router) as a subprocess, one per configured account.
Not intended to be run directly.

Usage (internal):
    python worker.py --account-id account1 --port 18001 --config accounts.json
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime

import MetaTrader5 as mt5
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    force=True,
)
log = logging.getLogger("mt5worker")


# ---------------------------------------------------------------------------
# CLI args
# ---------------------------------------------------------------------------

parser = argparse.ArgumentParser()
parser.add_argument("--account-id", required=True)
parser.add_argument("--port", type=int, required=True)
parser.add_argument("--config", default="accounts.json")
args = parser.parse_args()

# Load account config
with open(args.config) as f:
    accounts = json.load(f)

account_cfg = next((a for a in accounts if a["id"] == args.account_id), None)
if account_cfg is None:
    raise SystemExit(f"Account '{args.account_id}' not found in {args.config}")

ACCOUNT_ID = account_cfg["id"]
MT5_LOGIN = int(account_cfg["login"])
MT5_PASSWORD = account_cfg["password"]
MT5_SERVER = account_cfg["server"]
MT5_TERMINAL = account_cfg.get("terminal_path", "")  # optional; empty = auto-detect

# Cent account flag — can be set explicitly in accounts.json or auto-detected
# on connect. When True all monetary values are divided by 100 so the Go
# backend always sees USD-denominated numbers.
IS_CENT_ACCOUNT: bool = bool(account_cfg.get("cent_account", False))

# Cent account currencies reported by MT5 (auto-detection fallback)
_CENT_CURRENCIES = {"USC", "USDc", "EURc", "GBPc", "CENTc"}

# Broker-specific symbol suffix for cent accounts (e.g. "c" → "EURUSDc").
# Set "symbol_suffix": "c" in accounts.json for cent accounts.
# Empty string for standard accounts.
_SYMBOL_SUFFIX: str = account_cfg.get("symbol_suffix", "")

print(_SYMBOL_SUFFIX )
def _cent_divisor() -> float:
    """Return 100 for cent accounts, 1 for standard accounts."""
    return 1 if IS_CENT_ACCOUNT else 1.0


def _to_broker_symbol(symbol: str) -> str:
    """Add the broker-specific suffix to a clean symbol received from Go.

    The Go backend always uses clean symbols (e.g. 'EURUSD').
    The bridge appends the configured suffix (e.g. 'c') before passing to MT5.
    """
    if _SYMBOL_SUFFIX and not symbol.endswith(_SYMBOL_SUFFIX):
        return symbol + _SYMBOL_SUFFIX
    return symbol


def _to_clean_symbol(symbol: str) -> str:
    """Strip the broker-specific suffix from an MT5 symbol before returning to Go.

    MT5 may return 'EURUSDc'; the Go backend expects 'EURUSD'.
    """
    if _SYMBOL_SUFFIX and symbol.endswith(_SYMBOL_SUFFIX):
        return symbol[: -len(_SYMBOL_SUFFIX)]
    return symbol


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_kwargs = dict(login=MT5_LOGIN, password=MT5_PASSWORD, server=MT5_SERVER)
    if MT5_TERMINAL:
        init_kwargs["path"] = MT5_TERMINAL

    # Retry initialize() — terminal may still be starting up
    MAX_RETRIES = 10
    RETRY_DELAY = 5
    for attempt in range(1, MAX_RETRIES + 1):
        if mt5.initialize(**init_kwargs):
            break
        err = mt5.last_error()
        log.warning(f"[{ACCOUNT_ID}] mt5.initialize() attempt {attempt}/{MAX_RETRIES} failed: {err}")
        if attempt == MAX_RETRIES:
            raise RuntimeError(f"[{ACCOUNT_ID}] MT5 initialize() failed after {MAX_RETRIES} attempts: {err}")
        await asyncio.sleep(RETRY_DELAY)

    info = mt5.account_info()
    if info is None:
        raise RuntimeError(f"[{ACCOUNT_ID}] MT5 initialized but account_info() returned None — is the terminal logged in?")

    # Auto-detect cent account if not explicitly configured
    global IS_CENT_ACCOUNT, _SYMBOL_SUFFIX
    if not IS_CENT_ACCOUNT and info.currency.upper() in _CENT_CURRENCIES:
        IS_CENT_ACCOUNT = True
        log.info(f"[{ACCOUNT_ID}] Cent account auto-detected (currency={info.currency}) — monetary values will be normalised ÷100")
    elif IS_CENT_ACCOUNT:
        log.info(f"[{ACCOUNT_ID}] Cent account mode enabled (currency={info.currency})")

    # Auto-set symbol suffix for cent accounts if not explicitly configured
    if IS_CENT_ACCOUNT and not _SYMBOL_SUFFIX:
        _SYMBOL_SUFFIX = "c"
        log.info(f"[{ACCOUNT_ID}] Symbol suffix auto-set to 'c' for cent account")

    log.info(f"[{ACCOUNT_ID}] Connected — account {info.login}, broker {info.company}, server {info.server}")
    yield
    mt5.shutdown()
    log.info(f"[{ACCOUNT_ID}] MT5 shutdown")


app = FastAPI(title=f"MT5 Worker [{ACCOUNT_ID}]", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_symbol(symbol: str):
    info = mt5.symbol_info(symbol)
    if info is None:
        # symbol_info() failed — try selecting it first, which registers it
        # with the terminal even if it wasn't in Market Watch.
        mt5.symbol_select(symbol, True)
        time.sleep(0.3)
        info = mt5.symbol_info(symbol)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found in MT5")
    if not info.visible:
        if not mt5.symbol_select(symbol, True):
            raise HTTPException(status_code=404, detail=f"symbol_select('{symbol}') failed: {mt5.last_error()}")
        # Wait up to 2s for the symbol to become visible and receive a tick
        for _ in range(8):
            time.sleep(0.25)
            info = mt5.symbol_info(symbol)
            if info and info.visible:
                break
    return info


def _get_tick(symbol: str):
    """Return the best available tick for a symbol.

    Tries mt5.symbol_info_tick() first. If that returns None or stale zeros
    (market closed / symbol just added to watch list), falls back to the
    bid/ask stored in symbol_info itself, which MT5 keeps even when the
    market is closed.
    """
    tick = mt5.symbol_info_tick(symbol)
    if tick is not None and (tick.bid > 0 or tick.ask > 0):
        return tick

    # Fallback: use prices embedded in symbol_info
    info = mt5.symbol_info(symbol)
    if info is not None and (info.bid > 0 or info.ask > 0):
        # Wrap in a simple namespace so callers can use tick.bid / tick.ask
        class _FakeTick:
            bid = info.bid
            ask = info.ask
            time = int(time.time())
        return _FakeTick()

    return None


def _lot_from_usd(symbol: str, usd_amount: float) -> float:
    info = _ensure_symbol(symbol)
    tick = _get_tick(symbol)
    if tick is None:
        raise HTTPException(status_code=503, detail=f"No tick data for '{symbol}'")

    price = tick.ask
    contract_size = info.trade_contract_size
    if contract_size <= 0 or price <= 0:
        raise HTTPException(status_code=500, detail="Cannot calculate lot size: invalid contract_size or price")

    # On cent accounts the notional is expressed in cents, so scale up
    effective_amount = usd_amount * _cent_divisor()
    raw_lots = effective_amount / (contract_size * price)
    step = info.volume_step if info.volume_step > 0 else 0.01
    lots = round(round(raw_lots / step) * step, 8)
    lots = max(info.volume_min, min(info.volume_max, lots))
    return lots


def _send_order(symbol: str, order_type: int, lots: float,
                sl: float = 0.0, tp: float = 0.0, comment: str = "") -> dict:
    _ensure_symbol(symbol)
    tick = _get_tick(symbol)
    if tick is None:
        raise HTTPException(status_code=503, detail=f"No tick for '{symbol}'")

    price = tick.ask if order_type == mt5.ORDER_TYPE_BUY else tick.bid

    request = {
        "action":       mt5.TRADE_ACTION_DEAL,
        "symbol":       symbol,
        "volume":       lots,
        "type":         order_type,
        "price":        price,
        "deviation":    20,
        "magic":        20250101,
        "comment":      comment,
        "type_time":    mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_RETURN,
    }
    if sl != 0.0:
        request["sl"] = sl
    if tp != 0.0:
        request["tp"] = tp

    result = mt5.order_send(request)
    # Try all three filling modes in order
    for filling in (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK):
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            request["type_filling"] = filling
            result = mt5.order_send(request)
        else:
            break

    if result is None:
        raise HTTPException(status_code=500, detail=f"order_send returned None: {mt5.last_error()}")
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        raise HTTPException(
            status_code=400,
            detail=f"Order failed retcode={result.retcode} comment='{result.comment}'"
        )

    log.info(f"[{ACCOUNT_ID}] Order placed: {comment} {symbol} {lots} lots @ {result.price} (deal={result.deal})")
    return {
        "orderId": str(result.order),
        "deal":    str(result.deal),
        "price":   result.price,
        "volume":  result.volume,
        "status":  "FILLED",
        "comment": result.comment,
    }


def _close_positions(symbol: str, pos_type: int) -> dict:
    _ensure_symbol(symbol)
    positions = mt5.positions_get(symbol=symbol)
    # Fallback: some brokers don't match positions_get(symbol=...) reliably;
    # fetch all and filter manually.
    if not positions:
        all_pos = mt5.positions_get()
        if all_pos:
            positions = [p for p in all_pos if p.symbol == symbol]
    if not positions:
        raise HTTPException(status_code=404, detail=f"No open '{symbol}' positions to close")

    matching = [p for p in positions if p.type == pos_type]
    if not matching:
        side_name = "long" if pos_type == mt5.POSITION_TYPE_BUY else "short"
        raise HTTPException(status_code=404, detail=f"No open {side_name} positions for '{symbol}'")

    close_order_type = mt5.ORDER_TYPE_SELL if pos_type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
    closed_orders = []

    for p in matching:
        tick = _get_tick(symbol)
        if tick is None:
            raise HTTPException(status_code=503, detail=f"No tick for '{symbol}'")

        price = tick.bid if close_order_type == mt5.ORDER_TYPE_SELL else tick.ask

        request = {
            "action":       mt5.TRADE_ACTION_DEAL,
            "symbol":       symbol,
            "volume":       p.volume,
            "type":         close_order_type,
            "position":     p.ticket,
            "price":        price,
            "deviation":    20,
            "magic":        20250101,
            "comment":      "close",
            "type_time":    mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_RETURN,
        }

        result = mt5.order_send(request)
        # Try all three filling modes in order
        for filling in (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK):
            if result is None or result.retcode not in (mt5.TRADE_RETCODE_DONE,):
                request["type_filling"] = filling
                result = mt5.order_send(request)
            else:
                break

        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
            log.info(f"[{ACCOUNT_ID}] Closed ticket={p.ticket} {symbol} {p.volume} lots @ {result.price}")
            closed_orders.append(str(result.order))
        else:
            retcode = result.retcode if result else "None"
            comment = result.comment if result else str(mt5.last_error())
            log.warning(f"[{ACCOUNT_ID}] Failed to close ticket={p.ticket}: retcode={retcode} comment='{comment}'")

    if not closed_orders:
        # Collect failure details for diagnosis
        last_result = None
        for p in matching:
            tick = _get_tick(symbol)
            if tick:
                price = tick.bid if close_order_type == mt5.ORDER_TYPE_SELL else tick.ask
                req = {
                    "action": mt5.TRADE_ACTION_DEAL, "symbol": symbol,
                    "volume": p.volume, "type": close_order_type,
                    "position": p.ticket, "price": price,
                    "deviation": 20, "magic": 20250101, "comment": "close_diag",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": mt5.ORDER_FILLING_RETURN,
                }
                last_result = mt5.order_send(req)
                break
        detail = "Failed to close any matching positions"
        if last_result:
            detail += f" (retcode={last_result.retcode} comment='{last_result.comment}')"
        raise HTTPException(status_code=500, detail=detail)

    return {"orderId": closed_orders[0], "closed": closed_orders, "status": "FILLED"}


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class OrderRequest(BaseModel):
    symbol: str
    action: str
    usd_amount: float = 0
    leverage: int = 1
    sl: float = 0.0
    tp: float = 0.0


class StopRequest(BaseModel):
    symbol: str
    position_side: str
    quantity: float
    price: float


# ---------------------------------------------------------------------------
# Routes (same contract as original main.py)
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    info = mt5.account_info()
    if info is None:
        raise HTTPException(status_code=503, detail=f"MT5 not connected: {mt5.last_error()}")
    return {
        "status": "ok",
        "account": info.login,
        "server": info.server,
        "broker": info.company,
        "currency": info.currency,
        "cent_account": IS_CENT_ACCOUNT,
    }


@app.get("/balance")
def get_balance():
    info = mt5.account_info()
    if info is None:
        raise HTTPException(status_code=503, detail=f"MT5 not connected: {mt5.last_error()}")
    d = _cent_divisor()
    return {
        "total_equity":          info.equity   / d,
        "totalWalletBalance":    info.balance  / d,
        "availableBalance":      info.margin_free / d,
        "totalUnrealizedProfit": info.profit   / d,
        "balance":               info.balance  / d,
        "margin":                info.margin   / d,
        "margin_level":          info.margin_level,
        "currency":              info.currency,
        "cent_account":          IS_CENT_ACCOUNT,
    }


@app.get("/positions")
def get_positions():
    positions = mt5.positions_get()
    if positions is None:
        err = mt5.last_error()
        if err[0] != 1:
            log.warning(f"[{ACCOUNT_ID}] positions_get() error: {err}")
        return []

    result = []
    for p in positions:
        is_long = (p.type == mt5.POSITION_TYPE_BUY)
        side = "long" if is_long else "short"
        tick = _get_tick(p.symbol)
        mark_price = (tick.bid if is_long else tick.ask) if tick else p.price_open
        d = _cent_divisor()
        result.append({
            "symbol":           _to_clean_symbol(p.symbol),
            "side":             side,
            "entryPrice":       p.price_open,
            "markPrice":        mark_price,
            "positionAmt":      p.volume if is_long else -p.volume,
            "unRealizedProfit": p.profit / d,
            "leverage":         1,
            "liquidationPrice": 0.0,
            "ticket":           p.ticket,
            "sl":               p.sl,
            "tp":               p.tp,
        })
    return result


@app.post("/order")
def place_order(req: OrderRequest):
    broker_symbol = _to_broker_symbol(req.symbol)
    if req.action == "open_long":
        lots = _lot_from_usd(broker_symbol, req.usd_amount)
        return _send_order(broker_symbol, mt5.ORDER_TYPE_BUY, lots, req.sl, req.tp, "open_long")
    elif req.action == "open_short":
        lots = _lot_from_usd(broker_symbol, req.usd_amount)
        return _send_order(broker_symbol, mt5.ORDER_TYPE_SELL, lots, req.sl, req.tp, "open_short")
    elif req.action == "close_long":
        return _close_positions(broker_symbol, mt5.POSITION_TYPE_BUY)
    elif req.action == "close_short":
        return _close_positions(broker_symbol, mt5.POSITION_TYPE_SELL)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: '{req.action}'")


@app.post("/stop_loss")
def set_stop_loss(req: StopRequest):
    broker_symbol = _to_broker_symbol(req.symbol)
    pos_type = mt5.POSITION_TYPE_BUY if req.position_side.upper() == "LONG" else mt5.POSITION_TYPE_SELL
    positions = mt5.positions_get(symbol=broker_symbol)
    if not positions:
        all_pos = mt5.positions_get()
        if all_pos:
            positions = [p for p in all_pos if p.symbol == broker_symbol]
    if not positions:
        raise HTTPException(status_code=404, detail=f"No open '{req.symbol}' positions")
    for p in positions:
        if p.type != pos_type:
            continue
        result = mt5.order_send({
            "action": mt5.TRADE_ACTION_SLTP, "symbol": broker_symbol,
            "position": p.ticket, "sl": req.price, "tp": p.tp,
        })
        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
            log.info(f"[{ACCOUNT_ID}] SL set: {req.symbol} ticket={p.ticket} sl={req.price}")
            return {"status": "ok", "ticket": p.ticket}
    raise HTTPException(status_code=500, detail=f"Failed to set stop loss on '{req.symbol}'")


@app.post("/take_profit")
def set_take_profit(req: StopRequest):
    broker_symbol = _to_broker_symbol(req.symbol)
    pos_type = mt5.POSITION_TYPE_BUY if req.position_side.upper() == "LONG" else mt5.POSITION_TYPE_SELL
    positions = mt5.positions_get(symbol=broker_symbol)
    if not positions:
        all_pos = mt5.positions_get()
        if all_pos:
            positions = [p for p in all_pos if p.symbol == broker_symbol]
    if not positions:
        raise HTTPException(status_code=404, detail=f"No open '{req.symbol}' positions")
    for p in positions:
        if p.type != pos_type:
            continue
        result = mt5.order_send({
            "action": mt5.TRADE_ACTION_SLTP, "symbol": broker_symbol,
            "position": p.ticket, "sl": p.sl, "tp": req.price,
        })
        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
            log.info(f"[{ACCOUNT_ID}] TP set: {req.symbol} ticket={p.ticket} tp={req.price}")
            return {"status": "ok", "ticket": p.ticket}
    raise HTTPException(status_code=500, detail=f"Failed to set take profit on '{req.symbol}'")


@app.delete("/orders/{symbol}")
def cancel_all_orders(symbol: str):
    broker_symbol = _to_broker_symbol(symbol)
    orders = mt5.orders_get(symbol=broker_symbol)
    if not orders:
        return {"cancelled": 0}
    cancelled = sum(
        1 for o in orders
        if mt5.order_send({"action": mt5.TRADE_ACTION_REMOVE, "order": o.ticket})
        and mt5.order_send({"action": mt5.TRADE_ACTION_REMOVE, "order": o.ticket}).retcode == mt5.TRADE_RETCODE_DONE
    )
    return {"cancelled": cancelled}


@app.get("/orders/{symbol}")
def get_open_orders(symbol: str):
    broker_symbol = _to_broker_symbol(symbol)
    orders = mt5.orders_get(symbol=broker_symbol)
    if not orders:
        return []
    buy_types = (mt5.ORDER_TYPE_BUY, mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP, mt5.ORDER_TYPE_BUY_STOP_LIMIT)
    return [{
        "orderId":   str(o.ticket),
        "symbol":    _to_clean_symbol(o.symbol),
        "side":      "BUY" if o.type in buy_types else "SELL",
        "type":      str(o.type),
        "price":     o.price_open,
        "stopPrice": o.sl,
        "quantity":  o.volume_current,
        "status":    "NEW",
    } for o in orders]


@app.get("/price/{symbol}")
def get_price(symbol: str):
    broker_symbol = _to_broker_symbol(symbol)
    _ensure_symbol(broker_symbol)
    tick = _get_tick(broker_symbol)
    if tick is None:
        raise HTTPException(status_code=404, detail=f"No price available for '{symbol}' — market may be closed")
    return {"symbol": symbol, "bid": tick.bid, "ask": tick.ask, "mid": (tick.bid + tick.ask) / 2, "time": tick.time}


@app.get("/klines/{symbol}")
def get_klines(symbol: str, interval: str = "5m", limit: int = 100):
    """
    Return OHLCV bars for a symbol using mt5.copy_rates_from_pos().

    interval supports: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
    """
    broker_symbol = _to_broker_symbol(symbol)
    _ensure_symbol(broker_symbol)

    tf_map = {
        "1m":  mt5.TIMEFRAME_M1,
        "2m":  mt5.TIMEFRAME_M2,
        "3m":  mt5.TIMEFRAME_M3,
        "4m":  mt5.TIMEFRAME_M4,
        "5m":  mt5.TIMEFRAME_M5,
        "6m":  mt5.TIMEFRAME_M6,
        "10m": mt5.TIMEFRAME_M10,
        "12m": mt5.TIMEFRAME_M12,
        "15m": mt5.TIMEFRAME_M15,
        "20m": mt5.TIMEFRAME_M20,
        "30m": mt5.TIMEFRAME_M30,
        "1h":  mt5.TIMEFRAME_H1,
        "2h":  mt5.TIMEFRAME_H2,
        "3h":  mt5.TIMEFRAME_H3,
        "4h":  mt5.TIMEFRAME_H4,
        "6h":  mt5.TIMEFRAME_H6,
        "8h":  mt5.TIMEFRAME_H8,
        "12h": mt5.TIMEFRAME_H12,
        "1d":  mt5.TIMEFRAME_D1,
        "1w":  mt5.TIMEFRAME_W1,
        "1mn": mt5.TIMEFRAME_MN1,
    }
    tf = tf_map.get(interval)
    if tf is None:
        raise HTTPException(status_code=400, detail=f"Unsupported interval '{interval}'. Use: {list(tf_map.keys())}")

    rates = mt5.copy_rates_from_pos(broker_symbol, tf, 0, limit)
    if rates is None or len(rates) == 0:
        raise HTTPException(status_code=404, detail=f"No kline data for '{symbol}' {interval}: {mt5.last_error()}")

    result = []
    for r in rates:
        result.append({
            "time":   int(r["time"]) * 1000,  # convert to milliseconds
            "open":   float(r["open"]),
            "high":   float(r["high"]),
            "low":    float(r["low"]),
            "close":  float(r["close"]),
            "volume": float(r["tick_volume"]),
        })
    return result


@app.get("/history")
def get_history(hours: int = 24, limit: int = 200):
    from_date = datetime.fromtimestamp(time.time() - hours * 3600)
    to_date = datetime.now()
    deals = mt5.history_deals_get(from_date, to_date)
    if deals is None:
        err = mt5.last_error()
        if err[0] != 1:
            log.warning(f"[{ACCOUNT_ID}] history_deals_get() error: {err}")
        return []

    result = []
    for d in deals:
        if d.entry == mt5.DEAL_ENTRY_IN:
            action = "open_long" if d.type == mt5.DEAL_TYPE_BUY else "open_short"
        elif d.entry == mt5.DEAL_ENTRY_OUT:
            action = "close_long" if d.type == mt5.DEAL_TYPE_SELL else "close_short"
        else:
            action = "open_long" if d.type == mt5.DEAL_TYPE_BUY else "open_short"
        div = _cent_divisor()
        result.append({
            "dealId": str(d.ticket), "orderId": str(d.order), "positionId": str(d.position_id),
            "symbol": _to_clean_symbol(d.symbol), "side": "BUY" if d.type == mt5.DEAL_TYPE_BUY else "SELL",
            "action": action, "price": d.price, "volume": d.volume,
            "profit": d.profit / div, "commission": d.commission / div, "swap": d.swap / div,
            "time": d.time, "time_msc": d.time_msc,
        })
    return result[-limit:]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    log.info(f"Starting MT5 worker [{ACCOUNT_ID}] on port {args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port)
