import useSWR from 'swr'
import type {
  AccountInfo, Position, DecisionRecord as TradingDecisionRecord,
  TraderInfo, SystemStatus, TraderStats, EquityPoint,
} from '../types/trading'
import type { TraderOrder, DecisionRecord } from '../types/history'
import type { Exchange, ExchangeAccountState } from '../types/config'
import { API_BASE } from '../lib/httpClient.ts'

export function useTraders(enabled: boolean) {
  return useSWR<TraderInfo[]>(enabled ? `${API_BASE}/my-traders` : null)
}

export function useTraderStatus(traderId?: string) {
  return useSWR<SystemStatus>(
    traderId ? `${API_BASE}/status?trader_id=${traderId}` : null
  )
}

export function useAccount(traderId?: string) {
  return useSWR<AccountInfo>(
    traderId ? `${API_BASE}/account?trader_id=${traderId}` : null,
    { refreshInterval: 30_000, dedupingInterval: 10_000 }
  )
}

export function usePositions(traderId?: string) {
  return useSWR<Position[]>(
    traderId ? `${API_BASE}/positions?trader_id=${traderId}` : null,
    { refreshInterval: 30_000, dedupingInterval: 10_000 }
  )
}

export function useStatistics(traderId?: string) {
  return useSWR<TraderStats>(
    traderId ? `${API_BASE}/statistics?trader_id=${traderId}` : null,
    { refreshInterval: 120_000, dedupingInterval: 30_000 }
  )
}

export function useEquityHistory(traderId?: string) {
  return useSWR<EquityPoint[]>(
    traderId ? `${API_BASE}/equity-history?trader_id=${traderId}` : null,
    { refreshInterval: 120_000, dedupingInterval: 60_000 }
  )
}

export function useDecisions(traderId?: string, limit = 5) {
  return useSWR<TradingDecisionRecord[]>(
    traderId ? `${API_BASE}/decisions?trader_id=${traderId}&limit=${limit}` : null
  )
}

export function useOrders(traderId?: string, limit = 50, symbol?: string) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (traderId) params.append('trader_id', traderId)
  if (symbol) params.append('symbol', symbol)
  return useSWR<TraderOrder[]>(
    traderId ? `${API_BASE}/orders?${params}` : null,
    { refreshInterval: 30_000 }
  )
}

export function useDecisionHistory(traderId?: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (traderId) params.append('trader_id', traderId)
  return useSWR<DecisionRecord[]>(
    traderId ? `${API_BASE}/decisions?${params}` : null,
    { refreshInterval: 30_000 }
  )
}

export function useExchanges(enabled: boolean) {
  return useSWR<Exchange[]>(
    enabled ? `${API_BASE}/exchanges` : null,
    { refreshInterval: 0 }
  )
}

export function useExchangeStates(enabled: boolean) {
  return useSWR<{ states: Record<string, ExchangeAccountState> }>(
    enabled ? `${API_BASE}/exchanges/account-state` : null,
    { refreshInterval: 30_000 }
  )
}

// Competition leaderboard
export interface LeaderboardEntry {
  rank: number
  trader_id: string
  trader_name: string
  total_pnl: number
  total_pnl_pct: number
  win_rate: number
  total_trades: number
  is_running: boolean
}

export function useLeaderboard() {
  return useSWR<LeaderboardEntry[]>(
    `${API_BASE}/competition/leaderboard`,
    { refreshInterval: 60_000 }
  )
}

// Closed positions for analytics
export interface ClosedPosition {
  id: number
  symbol: string
  side: string
  entry_price: number
  exit_price: number
  quantity: number
  realized_pnl: number
  fee: number
  leverage: number
  entry_time: number
  exit_time: number
  close_reason: string
}

export function useClosedPositions(traderId?: string, limit = 100) {
  return useSWR<ClosedPosition[]>(
    traderId ? `${API_BASE}/positions/closed?trader_id=${traderId}&limit=${limit}` : null,
    { refreshInterval: 60_000 }
  )
}
