#!/bin/bash
# Stop all MT5 bridge processes (router + all workers + their cmd.exe wrappers)

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[MT5]${NC} $*"; }
warn() { echo -e "${YELLOW}[MT5]${NC} $*"; }

killed=0

# Kill router
for pid in $(pgrep -f "python3.*mt5bridge/main\.py" 2>/dev/null); do
    kill "$pid" 2>/dev/null && info "Stopped router (PID $pid)" && ((killed++))
done

# Kill worker Python processes
for pid in $(pgrep -f "worker\.py --account-id" 2>/dev/null); do
    kill "$pid" 2>/dev/null && info "Stopped worker (PID $pid)" && ((killed++))
done

# Kill cmd.exe wrappers that launched the worker bats
for pid in $(pgrep -f "cmd\.exe /c.*worker_.*\.bat" 2>/dev/null); do
    kill "$pid" 2>/dev/null && info "Stopped cmd.exe wrapper (PID $pid)" && ((killed++))
done

# Give processes a moment to exit cleanly
sleep 1

# Force-kill anything still alive
for pid in $(pgrep -f "worker\.py --account-id" 2>/dev/null); do
    kill -9 "$pid" 2>/dev/null && warn "Force-killed worker (PID $pid)" && ((killed++))
done
for pid in $(pgrep -f "cmd\.exe /c.*worker_.*\.bat" 2>/dev/null); do
    kill -9 "$pid" 2>/dev/null && warn "Force-killed cmd.exe (PID $pid)" && ((killed++))
done

if [ "$killed" -eq 0 ]; then
    warn "No MT5 bridge processes found"
else
    info "Done — stopped $killed process(es)"
fi
