#!/bin/bash
# MT5 Multi-Account Bridge
#
# 1. Launches each MT5 terminal (from accounts.json terminal_path)
# 2. Spawns one Wine Python worker per account
# 3. Starts the native Python router
#
# Usage:
#   ./mt5bridge/start.sh
#   MT5_BRIDGE_PORT=8001 ./mt5bridge/start.sh
#
# Environment variables:
#   MT5_BRIDGE_PORT             Router HTTP port (default: 8001)
#   MT5_ACCOUNTS_CONFIG         Path to accounts JSON (default: accounts.json)
#   MT5_WORKER_BASE_PORT        First worker port (default: 19000)
#   MT5_WORKER_STARTUP_TIMEOUT  Seconds to wait per worker (default: 60)
#   MT5_PYTHON                  Override Wine Python path

set -o pipefail

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${MT5_BRIDGE_PORT:-8001}"
WORKER_BASE="${MT5_WORKER_BASE_PORT:-19000}"
STARTUP_TIMEOUT="${MT5_WORKER_STARTUP_TIMEOUT:-60}"
CONFIG="${MT5_ACCOUNTS_CONFIG:-accounts.json}"
[[ "$CONFIG" = /* ]] || CONFIG="$BRIDGE_DIR/$CONFIG"
ROUTER_LOG="$BRIDGE_DIR/router.log"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[MT5]${NC} $*"; }
warn()  { echo -e "${YELLOW}[MT5]${NC} $*"; }
error() { echo -e "${RED}[MT5]${NC} $*"; exit 1; }
step()  { echo -e "${CYAN}[MT5]${NC} $*"; }

# Convert Linux path to Windows Z:\ path (no winepath — avoids space-splitting bug)
linux_to_win() { printf 'Z:%s' "$(printf '%s' "$1" | sed 's|/|\\|g')"; }

# Convert Windows C:\ path to Linux ~/.wine path
win_to_linux() { printf '%s' "$HOME/.wine/drive_c/$(printf '%s' "$1" | sed 's|C:\\||;s|\\|/|g')"; }

# ── validate ──────────────────────────────────────────────────────────────────
[ -f "$CONFIG" ] || error "Config not found: $CONFIG"
command -v python3 &>/dev/null || error "python3 not found"
command -v wine &>/dev/null    || error "wine not found"

# ── locate Wine Python ────────────────────────────────────────────────────────
if [ -n "$MT5_PYTHON" ]; then
    WINE_PYTHON="$MT5_PYTHON"
else
    for candidate in \
        "$HOME/.wine/drive_c/Program Files/Python311/python.exe" \
        "$HOME/.wine/drive_c/Program Files/Python310/python.exe" \
        "$HOME/.wine/drive_c/Python311/python.exe" \
        "$HOME/.wine/drive_c/Python310/python.exe"
    do
        [ -f "$candidate" ] && WINE_PYTHON="$candidate" && break
    done
    [ -n "$WINE_PYTHON" ] || error "Wine Python not found. Set MT5_PYTHON=/path/to/python.exe"
fi
info "Wine Python: $WINE_PYTHON"

# ── parse accounts ────────────────────────────────────────────────────────────
mapfile -t ACCOUNT_IDS < <(python3 -c "
import json, sys
[print(a['id']) for a in json.load(open(sys.argv[1]))]
" "$CONFIG")
[ ${#ACCOUNT_IDS[@]} -gt 0 ] || error "No accounts found in $CONFIG"
info "Accounts: ${ACCOUNT_IDS[*]}"

mapfile -t TERMINAL_PATHS < <(python3 -c "
import json, sys
[print(a.get('terminal_path','')) for a in json.load(open(sys.argv[1]))]
" "$CONFIG")

# ── install deps ──────────────────────────────────────────────────────────────
step "Installing router deps (native Python)..."
python3 -m pip install -q --break-system-packages fastapi "uvicorn[standard]" httpx \
    || warn "pip had warnings — continuing"

step "Installing worker deps (Wine Python)..."
W_PYTHON="$(linux_to_win "$WINE_PYTHON")"
W_REQ="$(linux_to_win "$BRIDGE_DIR/requirements.txt")"
PIP_BAT="$BRIDGE_DIR/_pip.bat"
printf '@echo off\r\n"%s" -m pip install -q -r "%s"\r\n' "$W_PYTHON" "$W_REQ" > "$PIP_BAT"
wine cmd /c "$(linux_to_win "$PIP_BAT")" 2>/dev/null || warn "pip (Wine) had warnings — continuing"
rm -f "$PIP_BAT"

# ── pre-compute shared Windows paths ─────────────────────────────────────────
step "Resolving Windows paths..."
# Use winepath only for the Wine Python exe (C:\ path, no spaces issue)
W_PYTHON="$(winepath -w "$WINE_PYTHON" 2>/dev/null)"
W_WORKER="$(linux_to_win "$BRIDGE_DIR/worker.py")"
W_CONFIG="$(linux_to_win "$CONFIG")"
info "  Python : $W_PYTHON"
info "  Worker : $W_WORKER"
info "  Config : $W_CONFIG"

# ── cleanup on exit ───────────────────────────────────────────────────────────
WORKER_PIDS=()
ROUTER_PID=""

cleanup() {
    echo ""
    info "Shutting down..."
    [ -n "$ROUTER_PID" ] && kill "$ROUTER_PID" 2>/dev/null
    for pid in "${WORKER_PIDS[@]}"; do kill "$pid" 2>/dev/null; done
    wait 2>/dev/null
    info "All processes stopped"
}
trap cleanup EXIT INT TERM

# ── launch MT5 terminals ──────────────────────────────────────────────────────
echo ""
step "Launching MT5 terminals..."
LAUNCHED_TERMINALS=()
for i in "${!ACCOUNT_IDS[@]}"; do
    ACCOUNT_ID="${ACCOUNT_IDS[$i]}"
    WIN_TERMINAL="${TERMINAL_PATHS[$i]}"
    [ -z "$WIN_TERMINAL" ] && warn "  [$ACCOUNT_ID] no terminal_path — skipping" && continue

    LINUX_TERMINAL="$(win_to_linux "$WIN_TERMINAL")"

    if [ ! -f "$LINUX_TERMINAL" ]; then
        warn "  [$ACCOUNT_ID] terminal not found: $LINUX_TERMINAL"
        continue
    fi

    # Don't launch the same exe twice
    already=false
    for t in "${LAUNCHED_TERMINALS[@]}"; do
        [ "$t" = "$WIN_TERMINAL" ] && already=true && break
    done
    if $already; then
        info "  [$ACCOUNT_ID] terminal already launched"
        continue
    fi

    info "  [$ACCOUNT_ID] launching: $LINUX_TERMINAL"
    wine "$LINUX_TERMINAL" &
    LAUNCHED_TERMINALS+=("$WIN_TERMINAL")
done

if [ ${#LAUNCHED_TERMINALS[@]} -gt 0 ]; then
    step "Waiting 20s for terminals to connect to brokers..."
    sleep 20
fi

# ── start workers ─────────────────────────────────────────────────────────────
echo ""
step "Starting workers..."
for i in "${!ACCOUNT_IDS[@]}"; do
    ACCOUNT_ID="${ACCOUNT_IDS[$i]}"
    WORKER_PORT=$((WORKER_BASE + i))
    LOG_FILE="$BRIDGE_DIR/worker_${ACCOUNT_ID}.log"
    BAT_FILE="$BRIDGE_DIR/worker_${ACCOUNT_ID}.bat"
    W_LOG="$(linux_to_win "$LOG_FILE")"
    W_BAT="$(linux_to_win "$BAT_FILE")"

    info "  [$ACCOUNT_ID] port=$WORKER_PORT  log=worker_${ACCOUNT_ID}.log"

    # Bat redirects its own output to a Windows path (WinError 6 workaround)
    printf '@echo off\r\n"%s" "%s" --account-id %s --port %s --config "%s" > "%s" 2>&1\r\n' \
        "$W_PYTHON" "$W_WORKER" "$ACCOUNT_ID" "$WORKER_PORT" "$W_CONFIG" "$W_LOG" > "$BAT_FILE"

    wine cmd /c "$W_BAT" &
    WORKER_PIDS+=($!)
done

# ── wait for workers ──────────────────────────────────────────────────────────
echo ""
step "Waiting for workers (timeout: ${STARTUP_TIMEOUT}s each)..."
ALL_READY=true
for i in "${!ACCOUNT_IDS[@]}"; do
    ACCOUNT_ID="${ACCOUNT_IDS[$i]}"
    WORKER_PORT=$((WORKER_BASE + i))
    READY=false
    DEADLINE=$((SECONDS + STARTUP_TIMEOUT))

    while [ $SECONDS -lt $DEADLINE ]; do
        if curl -sf "http://127.0.0.1:$WORKER_PORT/health" > /dev/null 2>&1; then
            info "  [$ACCOUNT_ID] ready on :$WORKER_PORT"
            READY=true
            break
        fi
        sleep 2
    done

    if [ "$READY" = false ]; then
        warn "  [$ACCOUNT_ID] not ready — check worker_${ACCOUNT_ID}.log"
        ALL_READY=false
    fi
done

[ "$ALL_READY" = false ] && warn "Some workers not ready — they return 503 until connected"

# ── start router ──────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
step "Starting router on :$PORT..."
info "  http://localhost:${PORT}/accounts"
echo ""

# Use a launcher script to avoid redirect issues with spaces in BRIDGE_DIR
LAUNCHER="$BRIDGE_DIR/_router.sh"
printf '#!/bin/bash\nexec python3 "%s/main.py" --config "%s"\n' "$BRIDGE_DIR" "$CONFIG" > "$LAUNCHER"
chmod +x "$LAUNCHER"

MT5_BRIDGE_PORT="$PORT" MT5_WORKER_BASE_PORT="$WORKER_BASE" \
    setsid "$LAUNCHER" >> "$ROUTER_LOG" 2>&1 &
ROUTER_PID=$!

for i in $(seq 1 15); do
    sleep 1
    if ! kill -0 "$ROUTER_PID" 2>/dev/null; then
        echo "--- router.log ---"; cat "$ROUTER_LOG" 2>/dev/null
        error "Router crashed"
    fi
    if curl -sf "http://127.0.0.1:$PORT/accounts" > /dev/null 2>&1; then
        info "Router up (PID=$ROUTER_PID)"
        break
    fi
done

info "Logs: router.log | worker_<id>.log  —  Press Ctrl+C to stop"
echo ""

tail -f "$ROUTER_LOG" &
wait "$ROUTER_PID"
