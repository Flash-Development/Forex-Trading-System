import { httpClient, API_BASE } from '../httpClient'
import { CryptoService } from '../crypto'
import type { Exchange, ExchangeAccountState } from '../../types/config'

export interface CreateExchangePayload {
  exchange_type: string
  account_name: string
  enabled: boolean
  api_key?: string
  secret_key?: string
  passphrase?: string
  testnet?: boolean
  hyperliquid_wallet_addr?: string
  aster_user?: string
  aster_signer?: string
  aster_private_key?: string
  lighter_wallet_addr?: string
  lighter_private_key?: string
  lighter_api_key_private_key?: string
  lighter_api_key_index?: number
}

export const exchangeApi = {
  async list(): Promise<Exchange[]> {
    const res = await httpClient.get<Exchange[]>(`${API_BASE}/exchanges`)
    if (!res.success) throw new Error(res.message ?? 'Failed to fetch exchanges')
    return Array.isArray(res.data) ? res.data : []
  },

  async getAccountStates(): Promise<Record<string, ExchangeAccountState>> {
    const res = await httpClient.get<{ states: Record<string, ExchangeAccountState> }>(
      `${API_BASE}/exchanges/account-state`
    )
    if (!res.success) throw new Error(res.message ?? 'Failed to fetch account states')
    return res.data?.states ?? {}
  },

  async create(payload: CreateExchangePayload): Promise<string> {
    // Req 2.8: wrap credential payload through CryptoService before sending
    const encrypted = await CryptoService.encryptPayload(JSON.stringify(payload))
    // encryptPayload returns EncryptedPayload when enabled, or the original string when disabled
    const body = typeof encrypted === 'string' ? payload : encrypted
    const res = await httpClient.post<{ id: string; message: string }>(
      `${API_BASE}/exchanges`,
      body
    )
    if (!res.success) throw new Error(res.message ?? 'Failed to create exchange')
    return res.data!.id
  },

  async update(id: string, payload: Partial<CreateExchangePayload>): Promise<void> {
    const innerPayload = { enabled: payload.enabled, ...payload }
    // Req 2.8: wrap credential payload through CryptoService before sending
    const encrypted = await CryptoService.encryptPayload(JSON.stringify(innerPayload))
    const finalInner = typeof encrypted === 'string' ? innerPayload : encrypted
    // Backend PUT /exchanges uses the map format: { exchanges: { [id]: {...} } }
    const res = await httpClient.put(`${API_BASE}/exchanges`, {
      exchanges: { [id]: finalInner },
    })
    if (!res.success) throw new Error(res.message ?? 'Failed to update exchange')
  },

  async remove(id: string): Promise<void> {
    const res = await httpClient.delete(`${API_BASE}/exchanges/${id}`)
    if (!res.success) throw new Error(res.message ?? 'Failed to delete exchange')
  },
}
