// Strategy Studio Types
export interface Strategy {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  is_public: boolean;           // 是否在策略市场公开
  config_visible: boolean;      // 配置参数是否公开可见
  config: StrategyConfig;
  created_at: string;
  updated_at: string;
}

// 策略使用统计
export interface StrategyStats {
  clone_count: number;          // 被克隆次数
  active_users: number;         // 当前使用人数
  top_performers?: StrategyPerformer[];  // 收益排行
}

// 策略使用者收益排行
export interface StrategyPerformer {
  user_id: string;
  user_name: string;            // 脱敏后的用户名
  total_pnl_pct: number;        // 总收益率
  total_pnl: number;            // 总收益金额
  win_rate: number;             // 胜率
  trade_count: number;          // 交易次数
  using_since: string;          // 使用开始时间
  rank: number;                 // 排名
}

export interface PromptSectionsConfig {
  role_definition?: string;
  trading_frequency?: string;
  entry_standards?: string;
  decision_process?: string;
}

export interface StrategyConfig {
  // Strategy type: "ai_trading" (default) or "grid_trading"
  strategy_type?: 'ai_trading' | 'grid_trading';
  // Language setting: "zh" for Chinese, "en" for English
  // Determines the language used for data formatting and prompt generation
  language?: 'zh' | 'en';
  // AI trading configuration. Legacy flat fields below are accepted only for
  // old data returned before the schema was split by strategy type.
  ai_config?: AIStrategyConfig;
  coin_source?: CoinSourceConfig;
  indicators?: IndicatorConfig;
  custom_prompt?: string;
  risk_control?: RiskControlConfig;
  prompt_sections?: PromptSectionsConfig;
  // Grid trading configuration (only used when strategy_type is 'grid_trading')
  grid_config?: GridStrategyConfig | null;
  publish_config?: PublishStrategyConfig;
}

export interface AIStrategyConfig {
  coin_source: CoinSourceConfig;
  indicators: IndicatorConfig;
  custom_prompt?: string;
  risk_control: RiskControlConfig;
  prompt_sections?: PromptSectionsConfig;
}

export interface PublishStrategyConfig {
  is_public: boolean;
  config_visible: boolean;
}

// Grid trading specific configuration
export interface GridStrategyConfig {
  // Trading pair (e.g., "BTCUSD")
  symbol: string;
  // Number of grid levels (5-50)
  grid_count: number;
  // Total investment in USD
  total_investment: number;
  // Leverage (1-20)
  leverage: number;
  // Upper price boundary (0 = auto-calculate from ATR)
  upper_price: number;
  // Lower price boundary (0 = auto-calculate from ATR)
  lower_price: number;
  // Use ATR to auto-calculate bounds
  use_atr_bounds: boolean;
  // ATR multiplier for bound calculation (default 2.0)
  atr_multiplier: number;
  // Position distribution: "uniform" | "gaussian" | "pyramid"
  distribution: 'uniform' | 'gaussian' | 'pyramid';
  // Maximum drawdown percentage before emergency exit
  max_drawdown_pct: number;
  // Stop loss percentage per position
  stop_loss_pct: number;
  // Daily loss limit percentage
  daily_loss_limit_pct: number;
  // Use maker-only orders for lower fees
  use_maker_only: boolean;
  // Enable automatic grid direction adjustment based on box breakouts
  enable_direction_adjust?: boolean;
  // Direction bias ratio for long_bias/short_bias modes (default 0.7 = 70%/30%)
  direction_bias_ratio?: number;
}

export interface CoinSourceConfig {
  source_type: 'static' | 'ai500' | 'oi_top' | 'oi_low' | 'mixed' | 'forex';
  static_coins?: string[];
  forex_pairs?: string[];          // forex pairs list (used when source_type = 'forex')
  excluded_coins?: string[];       // 排除的币种列表
  use_ai500: boolean;
  ai500_limit?: number;
  use_oi_top: boolean;
  oi_top_limit?: number;
  use_oi_low: boolean;
  oi_low_limit?: number;
  // Note: API URLs are now built automatically using nofxos_api_key from IndicatorConfig
}

export interface IndicatorConfig {
  klines: KlineConfig;
  // Raw OHLCV kline data - required for AI analysis
  enable_raw_klines: boolean;
  // Technical indicators (optional)
  enable_ema: boolean;
  enable_macd: boolean;
  enable_rsi: boolean;
  enable_atr: boolean;
  enable_boll: boolean;
  enable_volume: boolean;
  enable_oi: boolean;
  enable_funding_rate: boolean;
  ema_periods?: number[];
  rsi_periods?: number[];
  atr_periods?: number[];
  boll_periods?: number[];
  external_data_sources?: ExternalDataSource[];

  // ========== NofxOS 数据源统一配置 ==========
  // Unified NofxOS API Key - used for all NofxOS data sources
  nofxos_api_key?: string;

  // 量化数据源（资金流向、持仓变化、价格变化）
  enable_quant_data?: boolean;
  enable_quant_oi?: boolean;
  enable_quant_netflow?: boolean;

  // OI 排行数据（市场持仓量增减排行）
  enable_oi_ranking?: boolean;
  oi_ranking_duration?: string;  // "1h", "4h", "24h"
  oi_ranking_limit?: number;

  // NetFlow 排行数据（机构/散户资金流向排行）
  enable_netflow_ranking?: boolean;
  netflow_ranking_duration?: string;  // "1h", "4h", "24h"
  netflow_ranking_limit?: number;

  // Price 排行数据（涨跌幅排行）
  enable_price_ranking?: boolean;
  price_ranking_duration?: string;  // "1h", "4h", "24h" or "1h,4h,24h"
  price_ranking_limit?: number;
}

export interface KlineConfig {
  primary_timeframe: string;
  primary_count: number;
  longer_timeframe?: string;
  longer_count?: number;
  enable_multi_timeframe: boolean;
  // 新增：支持选择多个时间周期
  selected_timeframes?: string[];
}

export interface ExternalDataSource {
  name: string;
  type: 'api' | 'webhook';
  url: string;
  method: string;
  headers?: Record<string, string>;
  data_path?: string;
  refresh_secs?: number;
}

export interface RiskControlConfig {
  // Max number of coins held simultaneously (CODE ENFORCED)
  max_positions: number;

  // Trading Leverage - exchange leverage for opening positions (AI guided)
  btc_eth_max_leverage: number;    // BTC/ETH max exchange leverage
  altcoin_max_leverage: number;    // Altcoin max exchange leverage

  // Position Value Ratio - single position notional value / account equity (CODE ENFORCED)
  // Max position value = equity × this ratio
  btc_eth_max_position_value_ratio?: number;     // default: 5 (BTC/ETH max position = 5x equity)
  altcoin_max_position_value_ratio?: number;     // default: 1 (Altcoin max position = 1x equity)

  // Risk Parameters
  max_margin_usage: number;        // Max margin utilization, e.g. 0.9 = 90% (CODE ENFORCED)
  min_position_size: number;       // Min position size in USD (CODE ENFORCED)
  min_risk_reward_ratio: number;   // Min take_profit / stop_loss ratio (AI guided)
  min_confidence: number;          // Min AI confidence to open position (AI guided)

  // ── Forex / Percentage-Based Risk Management ──────────────────────────────
  /** Risk per trade as a fraction of equity, e.g. 0.01 = 1%.
   *  Used when risk_usd_per_trade is not set. */
  risk_pct_per_trade?: number;
  /** Fixed dollar risk per trade, e.g. 10 = risk exactly $10 per trade.
   *  Takes precedence over risk_pct_per_trade when set. */
  risk_usd_per_trade?: number;
  /** Max cumulative risk across all open positions, e.g. 0.06 = 6%. */
  max_total_risk_pct?: number;
  /** Max daily loss as % of equity before trading halts, e.g. 0.05 = 5%. */
  max_daily_loss_pct?: number;
  /** Max drawdown from equity peak before trading halts, e.g. 0.10 = 10%. */
  max_drawdown_pct?: number;
  /** Cent account: raw broker balance × 100 = effective USD equity. */
  is_cent_account?: boolean;
  /** Restrict execution to specific sessions: "london" | "new_york" | "tokyo" | "sydney" | "london_ny_overlap" */
  allowed_sessions?: string[];
  /** Preferred forex timeframes for multi-timeframe analysis. */
  forex_timeframes?: string[];
  /** Minimum lot size to submit — trades that compute below this are skipped (default: 0.01). */
  min_lots?: number;
}

// ── Backtest / Forward-test types ─────────────────────────────────────────────

export interface BacktestRequest {
  symbol: string;
  timeframe: string;
  bars: number;
  initial_equity: number;
  is_cent_account: boolean;
  risk_pct_per_trade: number;
  spread_pips: number;
  commission_usd: number;
  slippage_pips: number;
  run_monte_carlo: boolean;
  monte_carlo_runs: number;
  mt5_bridge_url?: string;
  signals?: BacktestSignalDTO[];
}

export interface BacktestSignalDTO {
  time: string;
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  lots?: number;
}

export interface BacktestTrade {
  symbol: string;
  side: string;
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  lots: number;
  stop_loss: number;
  take_profit: number;
  pnl_usd: number;
  pnl_pct: number;
  risk_usd: number;
  pips: number;
  is_win: boolean;
}

export interface EquityPoint {
  time: string;
  equity: number;
}

export interface MonteCarloResult {
  runs: number;
  median_return_pct: number;
  p5_return_pct: number;
  p95_return_pct: number;
  median_max_dd: number;
  p95_max_dd: number;
  ruin_probability: number;
  equity_curves?: number[][];
}

export interface BacktestResult {
  symbol: string;
  start_date: string;
  end_date: string;
  initial_equity: number;
  final_equity: number;
  total_return_pct: number;
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  max_drawdown_usd: number;
  avg_win_pips: number;
  avg_loss_pips: number;
  avg_rr: number;
  expected_value_pct: number;
  trades: BacktestTrade[];
  equity_curve: EquityPoint[];
  monte_carlo_result?: MonteCarloResult;
}

// ── MTF Backtest types ─────────────────────────────────────────────────────────

export interface MTFSignalInfo {
  side: string
  entry_price: number
  stop_loss: number
  take_profit: number
  confidence: number
}

export interface MTFSignalSummary {
  h4_trend: string
  h1_trend: string
  m15_setup: string
  m5_signal: string
  h4_ema20: number
  h1_ema20: number
  m5_rsi: number
  m5_atr: number
}

export interface MTFStepLog {
  bar_index: number
  time: string
  price: number
  mtf_summary: MTFSignalSummary
  signal?: MTFSignalInfo
  ai_reasoning?: string
  duration_ms: number
  alignment: string
}

export interface MTFTradeResult extends BacktestTrade {
  mtf_context: MTFSignalSummary
  ai_reasoning?: string
  confidence: number
  variant: string
}

export interface MTFAlignmentStats {
  total_steps: number
  full_long: number
  full_short: number
  partial_long: number
  partial_short: number
  no_signal: number
}

export interface MTFBacktestResult extends BacktestResult {
  mtf_trades: MTFTradeResult[]
  signal_log: MTFStepLog[]
  alignment_stats: MTFAlignmentStats
  symbol: string
  variant: string
  ai_call_count: number
}

export interface MTFBacktestRequest {
  config?: StrategyConfig | null
  symbol?: string
  variant: string
  bars: number
  context_bars: number
  initial_equity: number
  spread_pips: number
  commission_usd: number
  slippage_pips: number
  run_monte_carlo: boolean
  monte_carlo_runs: number
  ai_model_id?: string
  mt5_bridge_url?: string
}

export interface MTFImproveResponse {
  analysis: string
  suggestions: string[]
  improved_config_hints?: {
    variant?: string
    risk_pct_per_trade?: number
    min_confidence?: number
    min_risk_reward_ratio?: number
    spread_pips_recommendation?: number
  }
  duration_ms: number
}
