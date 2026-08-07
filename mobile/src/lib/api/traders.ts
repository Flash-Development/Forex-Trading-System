import type { TraderInfo, SystemStatus } from '../../types'
import { httpClient, API_BASE } from '../httpClient'

export interface CreateTraderPayload {
  name: string
  ai_model_id: string
  exchange_id: string
  strategy_id: string
  scan_interval_minutes?: number
  btc_eth_leverage?: number
  altcoin_leverage?: number
}

export const traderApi = {
  async getTraders(): Promise<TraderInfo[]> {
    const res = await httpClient.get<TraderInfo[]>(`${API_BASE}/my-traders`)
    if (!res.success) throw new Error(res.message ?? 'Failed to fetch traders')
    return Array.isArray(res.data) ? res.data : []
  },

  async createTrader(payload: CreateTraderPayload): Promise<{ trader_id: string; startup_warning?: string }> {
    const res = await httpClient.post<{ trader_id: string; startup_warning?: string }>(
      `${API_BASE}/traders`,
      payload
    )
    if (!res.success) throw new Error(res.message ?? 'Failed to create trader')
    return res.data!
  },

  async startTrader(traderId: string): Promise<void> {
    const res = await httpClient.post(`${API_BASE}/traders/${traderId}/start`)
    if (!res.success) throw new Error(res.message ?? 'Failed to start trader')
  },

  async stopTrader(traderId: string): Promise<void> {
    const res = await httpClient.post(`${API_BASE}/traders/${traderId}/stop`)
    if (!res.success) throw new Error(res.message ?? 'Failed to stop trader')
  },

  async getStatus(traderId: string): Promise<SystemStatus> {
    const res = await httpClient.get<SystemStatus>(`${API_BASE}/status?trader_id=${traderId}`)
    if (!res.success) throw new Error(res.message ?? 'Failed to fetch status')
    return res.data!
  },
}
