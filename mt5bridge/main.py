"""
MT5 Multi-Account Router (pure proxy — no subprocess management)

Workers are started externally by start.sh, one per account.
This process only proxies HTTP requests to the appropriate worker.

Requirements:
    pip3 install fastapi uvicorn httpx

Usage:
    python3 main.py --config accounts.json
    MT5_BRIDGE_PORT=8001 MT5_WORKER_BASE_PORT=19000 python3 main.py
"""

import argparse
import json
import logging
import os
import signal
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, Response

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mt5router")

# Ignore SIGHUP — keeps the process alive when launched from a subshell
signal.signal(signal.SIGHUP, signal.SIG_IGN)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

parser = argparse.ArgumentParser()
parser.add_argument("--config", default=os.environ.get("MT5_ACCOUNTS_CONFIG", "accounts.json"))
args = parser.parse_args()

ROUTER_PORT = int(os.environ.get("MT5_BRIDGE_PORT", 8001))
WORKER_BASE = int(os.environ.get("MT5_WORKER_BASE_PORT", 19000))

with open(args.config) as f:
    ACCOUNTS: list[dict] = json.load(f)

if not ACCOUNTS:
    raise SystemExit("No accounts defined in config file.")

# account_id -> {config, port}
WORKERS: dict[str, dict] = {
    account["id"]: {"config": account, "port": WORKER_BASE + i}
    for i, account in enumerate(ACCOUNTS)
}

log.info(f"Router configured for {len(WORKERS)} account(s):")
for aid, w in WORKERS.items():
    log.info(f"  {aid} -> 127.0.0.1:{w['port']}")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="MT5 Multi-Account Router", lifespan=lifespan)
_http = httpx.AsyncClient(timeout=30)

# ---------------------------------------------------------------------------
# Proxy helper
# ---------------------------------------------------------------------------

async def _proxy(account_id: str, path: str, request: Request) -> Response:
    w = WORKERS.get(account_id)
    if w is None:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")

    url = f"http://127.0.0.1:{w['port']}/{path.lstrip('/')}"
    if request.url.query:
        url += f"?{request.url.query}"

    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}

    try:
        resp = await _http.request(method=request.method, url=url, content=body, headers=headers)
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers),
            media_type=resp.headers.get("content-type"),
        )
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Worker for '{account_id}' is unreachable — is it running?")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/accounts")
async def list_accounts():
    result = []
    for account_id, w in WORKERS.items():
        entry = {
            "id":     account_id,
            "login":  w["config"].get("login"),
            "server": w["config"].get("server"),
            "port":   w["port"],
        }
        try:
            r = await _http.get(f"http://127.0.0.1:{w['port']}/health", timeout=3)
            entry["status"] = r.json() if r.status_code == 200 else {"error": r.text}
            entry["ready"] = r.status_code == 200
        except Exception as e:
            entry["status"] = {"error": str(e)}
            entry["ready"] = False
        result.append(entry)
    return result


@app.api_route(
    "/accounts/{account_id}/{path:path}",
    methods=["GET", "POST", "DELETE", "PUT", "PATCH"],
)
async def proxy_to_worker(account_id: str, path: str, request: Request):
    return await _proxy(account_id, path, request)


@app.api_route("/{path:path}", methods=["GET", "POST", "DELETE", "PUT", "PATCH"])
async def legacy_passthrough(path: str, request: Request):
    if path.startswith("accounts"):
        raise HTTPException(status_code=404, detail="Not found")
    if len(ACCOUNTS) != 1:
        raise HTTPException(
            status_code=400,
            detail=f"Multiple accounts configured. Use /accounts/{{account_id}}/... — available: {list(WORKERS.keys())}",
        )
    return await _proxy(ACCOUNTS[0]["id"], path, request)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    log.info(f"Starting MT5 router on :{ROUTER_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=ROUTER_PORT)
