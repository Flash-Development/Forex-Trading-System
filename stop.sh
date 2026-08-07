#!/bin/bash
# Stop all NOFX dev services

GREEN='\033[0;32m'; NC='\033[0m'
info() { echo -e "${GREEN}[stop]${NC} $*"; }

info "Stopping Go backend..."
pkill -f "go run main.go" 2>/dev/null
pkill -f "nofx" 2>/dev/null

info "Stopping web (Vite)..."
pkill -f "vite" 2>/dev/null

info "Stopping mobile (Expo)..."
pkill -f "expo" 2>/dev/null

info "Stopping MT5 bridge..."
pkill -f "mt5bridge/start.sh" 2>/dev/null
pkill -f "worker.py" 2>/dev/null
pkill -f "mt5bridge/main.py" 2>/dev/null
pkill -f "terminal64" 2>/dev/null

info "Done"
