export interface TraderOrder {
  id: number
  trader_id: string
  exchange_type: string
  exchange_order_id: string
  symbol: string
  side: string               // BUY | SELL
  position_side: string      // LONG | SHORT
  type: string               // MARKET | LIMIT
  order_action: string       // open_long | open_short | close_long | close_short
  quantity: number
  price: number
  avg_fill_price: number
  filled_quantity: number
  status: string             // NEW | FILLED | CANCELED
  commission: number
  commission_asset: string
  leverage: number
  created_at: number         // unix ms
  filled_at: number          // unix ms
}

export interface DecisionAction {
  action: string
  symbol: string
  quantity: number
  leverage: number
  price: number
  stop_loss?: number
  take_profit?: number
  confidence?: number
  reasoning?: string
  success: boolean
  error?: string
}

export interface DecisionRecord {
  id: number
  trader_id: string
  cycle_number: number
  timestamp: string          // ISO string
  cot_trace: string          // Full chain of thought from AI
  decision_json: string      // Raw JSON decisions
  decisions: DecisionAction[]
  execution_log: string[]
  success: boolean
  error_message: string
  ai_request_duration_ms: number
  candidate_coins: string[]
  account_state?: {
    total_balance: number
    available_balance: number
    position_count: number
    margin_used_pct: number
  }
}
