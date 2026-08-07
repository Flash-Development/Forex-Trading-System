#!/bin/bash
# FTS (Flash Trading System) Dev Launcher
# Starts: Go backend, Web (Vite), Mobile (Expo), MT5 Bridge
#
# Usage:
#   ./dev.sh              # start all
#   ./dev.sh --no-mobile  # skip mobile
#   ./dev.sh --no-mt5     # skip mt5 bridge

set -o pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.dev-logs"
mkdir -p "$LOGS"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}[dev]${NC} $*"; }
warn()  { echo -e "${YELLOW}[dev]${NC} $*"; }
error() { echo -e "${RED}[dev]${NC} $*"; }
step()  { echo -e "${CYAN}[dev]${NC} $*"; }

# ── flags ─────────────────────────────────────────────────────────────────────
RUN_MOBILE=true
RUN_MT5=true
for arg in "$@"; do
    case $arg in
        --no-mobile) RUN_MOBILE=false ;;
        --no-mt5)    RUN_MT5=false ;;
    esac
done

# ── pids ──────────────────────────────────────────────────────────────────────
PIDS=()

cleanup() {
    echo ""
    info "Shutting down all services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null
    done
    # MT5 bridge has its own cleanup via its trap
    [ -n "$MT5_PID" ] && kill "$MT5_PID" 2>/dev/null
    wait 2>/dev/null
    info "Done"
}
trap cleanup EXIT INT TERM

# ── helpers ───────────────────────────────────────────────────────────────────
require() {
    command -v "$1" &>/dev/null || { error "Required tool not found: $1"; exit 1; }
}

wait_for_port() {
    local port=$1 name=$2 timeout=${3:-30}
    local deadline=$((SECONDS + timeout))
    while [ $SECONDS -lt $deadline ]; do
        if curl -sf "http://localhost:$port" > /dev/null 2>&1 || \
           ss -tlnp | grep -q ":$port "; then
            info "  $name ready on :$port"
            return 0
        fi
        sleep 1
    done
    warn "  $name not ready on :$port after ${timeout}s — check $LOGS/$name.log"
    return 1
}

# ── preflight ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║           FTS — Flash Trading System                 ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

require go
require node
require npm

# ── 1. Go backend ─────────────────────────────────────────────────────────────
step "Starting Go backend..."
setsid go run "$ROOT/main.go" >> "$LOGS/backend.log" 2>&1 &
BACKEND_PID=$!
PIDS+=($BACKEND_PID)
wait_for_port 8080 "backend" 30 || true
info "  log: $LOGS/backend.log"

# ── 2. Web (Vite dev server) ──────────────────────────────────────────────────
step "Starting web (Vite)..."
if [ ! -f "$ROOT/web/node_modules/.bin/vite" ]; then
    info "  Installing web deps..."
    npm install --prefix "$ROOT/web"
fi
setsid npm run dev --prefix "$ROOT/web" >> "$LOGS/web.log" 2>&1 &
WEB_PID=$!
PIDS+=($WEB_PID)
wait_for_port 5173 "web" 30 || true
info "  log: $LOGS/web.log"

# ── 3. Mobile (Expo) ──────────────────────────────────────────────────────────
if $RUN_MOBILE; then
    step "Starting mobile (Expo)..."
    if [ ! -d "$ROOT/mobile/node_modules" ]; then
        info "  Installing mobile deps..."
        npm install --prefix "$ROOT/mobile" --silent
    fi
    setsid npm run start --prefix "$ROOT/mobile" -- --no-dev >> "$LOGS/mobile.log" 2>&1 &
    MOBILE_PID=$!
    PIDS+=($MOBILE_PID)
    info "  Expo starting... log: $LOGS/mobile.log"
else
    warn "  Mobile skipped (--no-mobile)"
fi

# ── 4. MT5 Bridge ─────────────────────────────────────────────────────────────
if $RUN_MT5; then
    step "Starting MT5 bridge..."
    if [ ! -f "$ROOT/mt5bridge/accounts.json" ]; then
        warn "  mt5bridge/accounts.json not found — skipping MT5 bridge"
    else
        setsid bash "$ROOT/mt5bridge/start.sh" >> "$LOGS/mt5bridge.log" 2>&1 &
        MT5_PID=$!
        PIDS+=($MT5_PID)
        info "  MT5 bridge starting (takes ~30-60s for terminals)..."
        info "  log: $LOGS/mt5bridge.log"
    fi
else
    warn "  MT5 bridge skipped (--no-mt5)"
fi

# ── summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "All services started. Press Ctrl+C to stop."
echo ""
echo -e "  ${GREEN}Backend${NC}   http://localhost:8080"
echo -e "  ${GREEN}Web${NC}       http://localhost:5173"
$RUN_MOBILE && echo -e "  ${GREEN}Mobile${NC}    expo (check $LOGS/mobile.log for QR)"
$RUN_MT5    && echo -e "  ${GREEN}MT5${NC}       http://localhost:8001/accounts"
echo -e "  ${GREEN}Logs${NC}      $LOGS/"
echo ""

# ── tail all logs to terminal ─────────────────────────────────────────────────
tail -f "$LOGS/backend.log" "$LOGS/web.log" \
    $( $RUN_MOBILE && echo "$LOGS/mobile.log" ) \
    $( $RUN_MT5    && echo "$LOGS/mt5bridge.log" ) 2>/dev/null &

wait
