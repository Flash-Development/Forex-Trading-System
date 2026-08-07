import type { SystemStatus, AccountInfo, Position, DecisionRecord } from '../../types'
import { httpClient, API_BASE } from '../httpClient'

export const dataApi = {
  async getStatus(traderId?: string): Promise<SystemStatus> {
    const url = traderId ? `${API_BASE}/status?trader_id=${traderId}` : `${API_BASE}/status`
    const res = await httpClient.get<SystemStatus>(url)
    return res.data!
  },

  async getAccount(traderId?: string): Promise<AccountInfo> {
    const url = traderId ? `${API_BASE}/account?trader_id=${traderId}` : `${API_BASE}/account`
    const res = await httpClient.get<AccountInfo>(url)
    return res.data!
  },

  async getPositions(traderId?: string): Promise<Position[]> {
    const url = traderId ? `${API_BASE}/positions?trader_id=${traderId}` : `${API_BASE}/positions`
    const res = await httpClient.get<Position[]>(url)
    return res.data!
  },

  async getDecisions(traderId?: string, limit = 5): Promise<DecisionRecord[]> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (traderId) params.append('trader_id', traderId)
    const res = await httpClient.get<DecisionRecord[]>(`${API_BASE}/decisions?${params}`)
    return res.data!
  },
}
