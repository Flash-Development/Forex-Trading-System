export interface AIModel {
  id: string
  name: string
  provider: string
  enabled: boolean
  apiKey?: string
  customApiUrl?: string
  customModelName?: string
}

// Matches SafeExchangeConfig from backend (no sensitive fields)
export interface Exchange {
  id: string
  exchange_type: string
  account_name: string
  name: string
  type: 'cex' | 'dex' | 'stock' | 'forex' | 'metals'
  enabled: boolean
  testnet?: boolean
  hyperliquidWalletAddr?: string
  asterUser?: string
  asterSigner?: string
  lighterWalletAddr?: string
}

export interface ExchangeAccountState {
  exchange_id: string
  status: 'ok' | 'disabled' | 'missing_credentials' | 'invalid_credentials' | 'permission_denied' | 'unavailable'
  display_balance?: string
  asset?: string
  total_equity?: number
  available_balance?: number
  checked_at: string
  error_code?: string
  error_message?: string
}

export interface TraderConfigData {
  trader_id: string
  trader_name: string
  exchange_id: string
  model_id: string
  strategy_type: 'ai_trading' | 'grid_trading'
}
