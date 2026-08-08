import { useState, useCallback, useEffect } from 'react'
import {
  Play,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Activity,
  Database,
  Bot,
  Zap,
  Info,
} from 'lucide-react'
import type {
  BacktestRequest,
  BacktestResult,
  MonteCarloResult,
  AIModel,
  StrategyConfig,
} from '../../types'

const API_BASE = import.meta.env.VITE_API_BASE || ''

interface BacktestPanelProps {
  token: string
  defaultSymbol?: string
  defaultEquity?: number
  isCentAccount?: boolean
  language: string
  mt5BridgeUrl?: string
  strategyConfig?: StrategyConfig | null
}

type SignalMode = 'ema' | 'ai'

const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d']
const CRYPTO_SYMBOLS = [
  'BTCUSD',
  'ETHUSD',
  'SOLUSD',
  'BNBUSD',
  'XRPUSD',
  'DOGEUSD',
  'ADAUSD',
  'AVAXUSD',
  'LINKUSD',
  'MATICUSD',
]

function pct(v: number | undefined | null) {
  return ((v ?? 0) * 100).toFixed(2) + '%'
}
function usd(v: number | undefined | null) {
  return '$' + (v ?? 0).toFixed(2)
}
function num(v: number | undefined | null, d = 2) {
  return (v ?? 0).toFixed(d)
}

interface SimulateRequest {
  config?: StrategyConfig | null
  bars: number
  step_bars?: number
  lookback_bars?: number
  initial_equity: number
  spread_pips: number
  commission_usd: number
  slippage_pips: number
  run_monte_carlo: boolean
  monte_carlo_runs: number
  ai_model_id: string
  mt5_bridge_url?: string
}

interface SimulateStep {
  bar_index: number
  time: string
  price: number
  duration_ms: number
  signal?: {
    side: string
    entry_price: number
    stop_loss: number
    take_profit: number
    confidence: number
  }
  ai_reasoning?: string
}

interface SimulateResult extends BacktestResult {
  steps: SimulateStep[]
  ai_call_count: number
  total_signals: number
  skipped_low_confidence: number
  used_fallback: boolean
  symbol: string
  timeframe: string
}

// ── helpers to read from strategy config ─────────────────────────────────────

function configSymbol(
  cfg: StrategyConfig | null | undefined,
  fallback: string
): string {
  const ai = cfg?.ai_config
  const coinSrc =
    ai?.coin_source ??
    (
      cfg as unknown as {
        coin_source?: {
          source_type?: string
          forex_pairs?: string[]
          static_coins?: string[]
        }
      }
    )?.coin_source
  if (coinSrc?.source_type === 'forex' && coinSrc.forex_pairs?.length)
    return coinSrc.forex_pairs[0]
  if (coinSrc?.source_type === 'static' && coinSrc.static_coins?.length)
    return coinSrc.static_coins[0]
  return fallback
}

function configTimeframe(
  cfg: StrategyConfig | null | undefined,
  fallback: string
): string {
  const ai = cfg?.ai_config
  const tf =
    ai?.indicators?.klines?.primary_timeframe ??
    (
      cfg as unknown as {
        indicators?: { klines?: { primary_timeframe?: string } }
      }
    )?.indicators?.klines?.primary_timeframe
  return tf || fallback
}

function configRiskPct(cfg: StrategyConfig | null | undefined): number {
  const ai = cfg?.ai_config
  return (
    ai?.risk_control?.risk_pct_per_trade ??
    (cfg as unknown as { risk_control?: { risk_pct_per_trade?: number } })
      ?.risk_control?.risk_pct_per_trade ??
    0.01
  )
}

function configIsCent(cfg: StrategyConfig | null | undefined): boolean {
  const ai = cfg?.ai_config
  return (
    ai?.risk_control?.is_cent_account ??
    (cfg as unknown as { risk_control?: { is_cent_account?: boolean } })
      ?.risk_control?.is_cent_account ??
    false
  )
}

export function BacktestPanel({
  token,
  defaultSymbol = 'EURUSD',
  defaultEquity = 10000,
  isCentAccount = false,
  language,
  mt5BridgeUrl,
  strategyConfig,
}: BacktestPanelProps) {
  const zh = language === 'zh'
  const [signalMode, setSignalMode] = useState<SignalMode>('ema')

  // ── EMA mode state (manual symbol/timeframe) ────────────────────────────
  const [symbolMode, setSymbolMode] = useState<'forex' | 'crypto'>(() =>
    ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'XAU', 'XAG'].some((p) =>
      defaultSymbol.startsWith(p)
    )
      ? 'forex'
      : 'crypto'
  )
  const [emaCfg, setEmaCfg] = useState<BacktestRequest>({
    symbol: defaultSymbol,
    timeframe: '1h',
    bars: 300,
    initial_equity: defaultEquity,
    is_cent_account: isCentAccount,
    risk_pct_per_trade: 0.01,
    spread_pips: 1.5,
    commission_usd: 0,
    slippage_pips: 0.5,
    run_monte_carlo: true,
    monte_carlo_runs: 500,
  })
  const [forexPairs, setForexPairs] = useState<{
    majors: string[]
    minors: string[]
    commodities: string[]
  }>({ majors: [], minors: [], commodities: [] })

  // ── AI mode state ─────────────────────────────────────────────────────────
  const [aiCfg, setAiCfg] = useState({
    bars: 300,
    initial_equity: defaultEquity,
    spread_pips: 1.5,
    commission_usd: 0,
    slippage_pips: 0.5,
    run_monte_carlo: true,
  })
  const [aiModels, setAiModels] = useState<AIModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')

  // ── shared state ──────────────────────────────────────────────────────────
  const [result, setResult] = useState<BacktestResult | SimulateResult | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTrades, setShowTrades] = useState(false)
  const [showMC, setShowMC] = useState(false)
  const [showSteps, setShowSteps] = useState(false)

  // ── data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/forex/pairs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.majors) setForexPairs(d)
      })
      .catch(console.error)
  }, [token])

  useEffect(() => {
    if (signalMode !== 'ai') return
    fetch(`${API_BASE}/api/models`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: AIModel[]) => {
        const enabled = (Array.isArray(data) ? data : []).filter(
          (m) => m.enabled
        )
        setAiModels(enabled)
        if (enabled.length > 0 && !selectedModelId)
          setSelectedModelId(enabled[0].id)
      })
      .catch(console.error)
  }, [signalMode, token])

  useEffect(() => {
    const all = [
      ...forexPairs.majors,
      ...forexPairs.minors,
      ...forexPairs.commodities,
    ]
    if (
      symbolMode === 'forex' &&
      all.length > 0 &&
      !all.includes(emaCfg.symbol)
    )
      setEmaCfg((p) => ({ ...p, symbol: forexPairs.majors[0] ?? 'EURUSD' }))
    else if (symbolMode === 'crypto' && !CRYPTO_SYMBOLS.includes(emaCfg.symbol))
      setEmaCfg((p) => ({ ...p, symbol: 'BTCUSD' }))
  }, [symbolMode, forexPairs])

  const updateEma = <K extends keyof BacktestRequest>(
    k: K,
    v: BacktestRequest[K]
  ) => setEmaCfg((p) => ({ ...p, [k]: v }))

  // ── derived info for AI mode ───────────────────────────────────────────────
  const aiSymbol = configSymbol(strategyConfig, defaultSymbol)
  const aiTimeframe = configTimeframe(strategyConfig, '1h')
  const aiRiskPct = configRiskPct(strategyConfig)
  const aiIsCent = configIsCent(strategyConfig)
  // auto step: call AI every ~10% of bars, between 10 and 50
  const autoStep = Math.min(50, Math.max(10, Math.floor(aiCfg.bars / 10)))
  const estCalls = Math.floor(aiCfg.bars / autoStep)

  // ── run ───────────────────────────────────────────────────────────────────
  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      if (signalMode === 'ai') {
        if (!selectedModelId)
          throw new Error(zh ? '请选择AI模型' : 'Select an AI model first')
        if (!strategyConfig)
          throw new Error(
            zh ? '未找到策略配置' : 'No strategy config available'
          )

        const body: SimulateRequest = {
          config: strategyConfig,
          bars: aiCfg.bars,
          initial_equity: aiCfg.initial_equity,
          spread_pips: aiCfg.spread_pips,
          commission_usd: aiCfg.commission_usd,
          slippage_pips: aiCfg.slippage_pips,
          run_monte_carlo: aiCfg.run_monte_carlo,
          monte_carlo_runs: 500,
          ai_model_id: selectedModelId,
          mt5_bridge_url: mt5BridgeUrl ?? '',
        }
        const res = await fetch(`${API_BASE}/api/backtest/simulate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        })
        if (!res.ok)
          throw new Error(
            ((await res.json().catch(() => ({}))) as { error?: string })
              .error ?? `HTTP ${res.status}`
          )
        setResult(await res.json())
      } else {
        const body: BacktestRequest & { mt5_bridge_url?: string } = {
          ...emaCfg,
        }
        if (symbolMode === 'forex' && mt5BridgeUrl)
          body.mt5_bridge_url = mt5BridgeUrl
        const res = await fetch(`${API_BASE}/api/backtest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        })
        if (!res.ok)
          throw new Error(
            ((await res.json().catch(() => ({}))) as { error?: string })
              .error ?? `HTTP ${res.status}`
          )
        setResult(await res.json())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [
    signalMode,
    selectedModelId,
    strategyConfig,
    aiCfg,
    mt5BridgeUrl,
    emaCfg,
    symbolMode,
    token,
    zh,
  ])

  const allForexSymbols = [
    ...forexPairs.majors,
    ...forexPairs.minors,
    ...forexPairs.commodities,
  ]
  const simResult = result as SimulateResult | null

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div
        className="flex rounded overflow-hidden"
        style={{ border: '1px solid #2A344A' }}
      >
        <button
          onClick={() => setSignalMode('ema')}
          className="flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          style={{
            background:
              signalMode === 'ema' ? 'var(--color-card)' : 'transparent',
            color:
              signalMode === 'ema'
                ? 'var(--color-accent)'
                : 'var(--color-muted)',
          }}
        >
          <Zap className="w-3.5 h-3.5" />
          {zh ? 'EMA 穿越基线' : 'EMA Crossover'}
        </button>
        <button
          onClick={() => setSignalMode('ai')}
          className="flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          style={{
            background:
              signalMode === 'ai' ? 'var(--color-card)' : 'transparent',
            color:
              signalMode === 'ai'
                ? 'var(--color-primary)'
                : 'var(--color-muted)',
            borderLeft: '1px solid #2A344A',
          }}
        >
          <Bot className="w-3.5 h-3.5" />
          {zh ? 'AI 策略模拟' : 'AI Strategy Simulation'}
        </button>
      </div>

      {/* Description */}
      <div className="flex items-start gap-2 px-1">
        <Info
          className="w-3 h-3 mt-0.5 flex-shrink-0"
          style={{ color: 'var(--color-muted)' }}
        />
        <p
          className="text-xs leading-relaxed"
          style={{ color: 'var(--color-muted)' }}
        >
          {signalMode === 'ema'
            ? zh
              ? 'EMA(20/50)穿越信号，快速基线测试，不使用AI'
              : 'EMA(20/50) crossover signals — fast baseline, no AI'
            : zh
              ? `使用当前策略（${aiSymbol} · ${aiTimeframe}），AI在历史K线上逐步决策，模拟真实交易，测量策略准确性`
              : `Uses current strategy (${aiSymbol} · ${aiTimeframe}) — AI steps through historical bars making real decisions to measure strategy accuracy`}
        </p>
      </div>

      {/* Config panel */}
      <div
        className="p-4 rounded-lg space-y-4"
        style={{ background: 'var(--color-bg)', border: '1px solid #2A344A' }}
      >
        {signalMode === 'ai' ? (
          /* ── AI simulation config ── */
          <div className="space-y-4">
            {/* Strategy summary */}
            <div
              className="p-3 rounded-lg"
              style={{
                background: 'var(--color-card)',
                border: '1px solid #2A344A',
              }}
            >
              <p
                className="text-xs font-medium mb-2"
                style={{ color: 'var(--color-muted)' }}
              >
                {zh ? '从当前策略读取' : 'Derived from current strategy'}
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: zh ? '标的' : 'Symbol', value: aiSymbol },
                  { label: zh ? '周期' : 'Timeframe', value: aiTimeframe },
                  {
                    label: zh ? '风险/笔' : 'Risk/trade',
                    value: `${(aiRiskPct * 100).toFixed(1)}%`,
                  },
                  ...(aiIsCent ? [{ label: 'Cent acct', value: '✓' }] : []),
                ].map((item) => (
                  <span
                    key={item.label}
                    className="px-2 py-1 rounded text-xs font-mono"
                    style={{
                      background: 'var(--color-bg)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {item.label}: {item.value}
                  </span>
                ))}
              </div>
            </div>

            {/* AI Model picker */}
            <div>
              <label
                className="block text-xs mb-1"
                style={{ color: 'var(--color-muted)' }}
              >
                {zh ? 'AI 模型' : 'AI Model'}
              </label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm"
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid #2A344A',
                  color: 'var(--color-text)',
                }}
              >
                {aiModels.length === 0 && (
                  <option value="">{zh ? '加载中...' : 'Loading...'}</option>
                )}
                {aiModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? 'K线数量' : 'Bars'}
                </label>
                <input
                  type="number"
                  value={aiCfg.bars}
                  min={100}
                  max={1000}
                  onChange={(e) =>
                    setAiCfg((p) => ({
                      ...p,
                      bars: parseInt(e.target.value) || 300,
                    }))
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid #2A344A',
                    color: 'var(--color-text)',
                  }}
                />
                <p
                  className="text-xs mt-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  ~{estCalls} {zh ? '次AI调用' : 'AI calls'}
                </p>
              </div>
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? '初始权益' : 'Initial Equity'}{' '}
                  {aiIsCent ? '(cent)' : '(USD)'}
                </label>
                <input
                  type="number"
                  value={aiCfg.initial_equity}
                  min={100}
                  onChange={(e) =>
                    setAiCfg((p) => ({
                      ...p,
                      initial_equity: parseFloat(e.target.value) || 10000,
                    }))
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid #2A344A',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? '点差 (pips)' : 'Spread (pips)'}
                </label>
                <input
                  type="number"
                  value={aiCfg.spread_pips}
                  min={0}
                  max={20}
                  step={0.1}
                  onChange={(e) =>
                    setAiCfg((p) => ({
                      ...p,
                      spread_pips: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid #2A344A',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? '佣金 (USD/lot)' : 'Commission'}
                </label>
                <input
                  type="number"
                  value={aiCfg.commission_usd}
                  min={0}
                  step={0.5}
                  onChange={(e) =>
                    setAiCfg((p) => ({
                      ...p,
                      commission_usd: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid #2A344A',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiCfg.run_monte_carlo}
                  onChange={(e) =>
                    setAiCfg((p) => ({
                      ...p,
                      run_monte_carlo: e.target.checked,
                    }))
                  }
                  className="accent-cyan-400"
                />
                <span
                  className="text-xs"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Monte Carlo
                </span>
              </label>
            </div>
          </div>
        ) : (
          /* ── EMA crossover config ── */
          <div className="space-y-4">
            {/* Symbol mode */}
            <div
              className="flex rounded overflow-hidden"
              style={{ border: '1px solid #2A344A' }}
            >
              {(['forex', 'crypto'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSymbolMode(mode)}
                  className="flex-1 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background:
                      symbolMode === mode
                        ? 'var(--color-border)'
                        : 'transparent',
                    color:
                      symbolMode === mode
                        ? 'var(--color-text)'
                        : 'var(--color-muted)',
                    borderRight:
                      mode === 'forex' ? '1px solid #2A344A' : 'none',
                  }}
                >
                  {mode === 'forex'
                    ? zh
                      ? '外汇/商品'
                      : 'Forex'
                    : zh
                      ? '加密货币'
                      : 'Crypto'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? '交易对' : 'Symbol'}
                </label>
                {symbolMode === 'forex' ? (
                  <select
                    value={emaCfg.symbol}
                    onChange={(e) => updateEma('symbol', e.target.value)}
                    className="w-full px-3 py-2 rounded text-sm"
                    style={{
                      background: 'var(--color-card)',
                      border: '1px solid #2A344A',
                      color: 'var(--color-text)',
                    }}
                  >
                    {allForexSymbols.length > 0 ? (
                      <>
                        {forexPairs.majors.length > 0 && (
                          <optgroup label="Majors">
                            {forexPairs.majors.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {forexPairs.minors.length > 0 && (
                          <optgroup label="Minors">
                            {forexPairs.minors.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {forexPairs.commodities.length > 0 && (
                          <optgroup label="Commodities">
                            {forexPairs.commodities.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </>
                    ) : (
                      <option value={emaCfg.symbol}>{emaCfg.symbol}</option>
                    )}
                  </select>
                ) : (
                  <select
                    value={emaCfg.symbol}
                    onChange={(e) => updateEma('symbol', e.target.value)}
                    className="w-full px-3 py-2 rounded text-sm"
                    style={{
                      background: 'var(--color-card)',
                      border: '1px solid #2A344A',
                      color: 'var(--color-text)',
                    }}
                  >
                    {CRYPTO_SYMBOLS.map((p) => (
                      <option key={p} value={p}>
                        {p.replace('USD', '/USD')}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? '时间周期' : 'Timeframe'}
                </label>
                <select
                  value={emaCfg.timeframe}
                  onChange={(e) => updateEma('timeframe', e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid #2A344A',
                    color: 'var(--color-text)',
                  }}
                >
                  {TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? 'K线数量' : 'Bars'}
                </label>
                <input
                  type="number"
                  value={emaCfg.bars}
                  min={100}
                  max={2000}
                  onChange={(e) =>
                    updateEma('bars', parseInt(e.target.value) || 500)
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid #2A344A',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? '初始权益' : 'Initial Equity'}{' '}
                  {emaCfg.is_cent_account ? '(cent)' : '(USD)'}
                </label>
                <input
                  type="number"
                  value={emaCfg.initial_equity}
                  min={100}
                  onChange={(e) =>
                    updateEma(
                      'initial_equity',
                      parseFloat(e.target.value) || 10000
                    )
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid #2A344A',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? '每笔风险%' : 'Risk % / Trade'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={Math.round(emaCfg.risk_pct_per_trade * 1000)}
                    onChange={(e) =>
                      updateEma(
                        'risk_pct_per_trade',
                        parseInt(e.target.value) / 1000
                      )
                    }
                    className="flex-1"
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span
                    className="w-12 text-center text-sm font-mono"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {(emaCfg.risk_pct_per_trade * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {zh ? '点差 (pips)' : 'Spread (pips)'}
                </label>
                <input
                  type="number"
                  value={emaCfg.spread_pips}
                  min={0}
                  max={20}
                  step={0.1}
                  onChange={(e) =>
                    updateEma('spread_pips', parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid #2A344A',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {symbolMode === 'forex' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emaCfg.is_cent_account}
                    onChange={(e) =>
                      updateEma('is_cent_account', e.target.checked)
                    }
                    className="accent-cyan-400"
                  />
                  <span
                    className="text-xs"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {zh ? '美分账户' : 'Cent Account'}
                  </span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emaCfg.run_monte_carlo}
                  onChange={(e) =>
                    updateEma('run_monte_carlo', e.target.checked)
                  }
                  className="accent-cyan-400"
                />
                <span
                  className="text-xs"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Monte Carlo
                </span>
              </label>
            </div>

            {symbolMode === 'forex' && (
              <div className="flex items-center gap-1.5">
                <Database
                  className="w-3 h-3"
                  style={{
                    color: mt5BridgeUrl
                      ? 'var(--color-success)'
                      : 'var(--color-primary)',
                  }}
                />
                <span
                  className="text-xs"
                  style={{
                    color: mt5BridgeUrl
                      ? 'var(--color-success)'
                      : 'var(--color-primary)',
                  }}
                >
                  {mt5BridgeUrl
                    ? zh
                      ? 'MT5桥接数据'
                      : 'MT5 Bridge'
                    : zh
                      ? '无MT5桥接 — Binance备用'
                      : 'No MT5 bridge — Binance fallback'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={run}
          disabled={loading}
          className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-all"
          style={{
            background: loading
              ? 'var(--color-border)'
              : signalMode === 'ai'
                ? 'var(--color-primary)'
                : 'var(--color-accent)',
            color: loading ? 'var(--color-muted)' : '#000',
          }}
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : signalMode === 'ai' ? (
            <Bot className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {loading
            ? zh
              ? '运行中...'
              : 'Running...'
            : signalMode === 'ai'
              ? zh
                ? '运行AI策略模拟'
                : 'Run AI Strategy Simulation'
              : zh
                ? '运行回测'
                : 'Run Backtest'}
        </button>

        {error && (
          <div
            className="p-3 rounded text-sm"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: 'var(--color-danger)',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <BacktestResults
          result={result}
          simResult={signalMode === 'ai' ? simResult : null}
          language={language}
          showTrades={showTrades}
          setShowTrades={setShowTrades}
          showMC={showMC}
          setShowMC={setShowMC}
          showSteps={showSteps}
          setShowSteps={setShowSteps}
        />
      )}
    </div>
  )
}

// ── Results ────────────────────────────────────────────────────────────────

function BacktestResults({
  result,
  simResult,
  language,
  showTrades,
  setShowTrades,
  showMC,
  setShowMC,
  showSteps,
  setShowSteps,
}: {
  result: BacktestResult
  simResult: SimulateResult | null
  language: string
  showTrades: boolean
  setShowTrades: (v: boolean) => void
  showMC: boolean
  setShowMC: (v: boolean) => void
  showSteps: boolean
  setShowSteps: (v: boolean) => void
}) {
  const zh = language === 'zh'
  const profitable = result.total_return_pct > 0
  const win = result.win_rate >= 0.5

  return (
    <div className="space-y-4">
      {/* Meta / accuracy header */}
      {simResult ? (
        <div
          className="p-3 rounded-lg flex items-start gap-3"
          style={{
            background: profitable
              ? 'rgba(16,185,129,0.08)'
              : 'rgba(239,68,68,0.08)',
            border: `1px solid ${profitable ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}
        >
          <Bot
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{
              color: profitable
                ? 'var(--color-success)'
                : 'var(--color-danger)',
            }}
          />
          <div className="min-w-0">
            <p
              className="text-sm font-semibold"
              style={{
                color: profitable
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            >
              {zh ? 'AI策略准确率' : 'AI Strategy Accuracy'}:{' '}
              {pct(result.win_rate)}
              {'  '}
              {result.win_rate >= 0.6
                ? '✓ Strong'
                : result.win_rate >= 0.5
                  ? '~ Marginal'
                  : '✗ Weak'}
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: 'var(--color-muted)' }}
            >
              {simResult.symbol} · {simResult.timeframe} ·{' '}
              {simResult.ai_call_count} {zh ? '次AI调用' : 'AI calls'} ·{' '}
              {simResult.total_signals} {zh ? '个信号' : 'signals'}
              {simResult.skipped_low_confidence > 0 &&
                ` · ${simResult.skipped_low_confidence} ${zh ? '低置信跳过' : 'skipped (low confidence)'}`}
              {simResult.used_fallback && (
                <span style={{ color: 'var(--color-primary)' }}>
                  {' '}
                  ·{' '}
                  {zh
                    ? 'AI无信号，已用EMA基线'
                    : 'AI produced no signals — EMA fallback used'}
                </span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {result.start_date
              ? new Date(result.start_date).toLocaleDateString()
              : ''}
            {' → '}
            {result.end_date
              ? new Date(result.end_date).toLocaleDateString()
              : ''}
          </span>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={zh ? '总收益' : 'Total Return'}
          value={pct(result.total_return_pct)}
          color={profitable ? 'var(--color-success)' : 'var(--color-danger)'}
        />
        <StatCard
          label={zh ? '胜率' : 'Win Rate'}
          value={pct(result.win_rate)}
          color={win ? 'var(--color-success)' : 'var(--color-danger)'}
        />
        <StatCard
          label={zh ? '盈利因子' : 'Profit Factor'}
          value={num(result.profit_factor)}
          color={
            (result.profit_factor ?? 0) >= 1.5
              ? 'var(--color-success)'
              : (result.profit_factor ?? 0) >= 1
                ? 'var(--color-primary)'
                : 'var(--color-danger)'
          }
        />
        <StatCard
          label={zh ? '夏普比率' : 'Sharpe Ratio'}
          value={num(result.sharpe_ratio)}
          color={
            (result.sharpe_ratio ?? 0) >= 1
              ? 'var(--color-success)'
              : (result.sharpe_ratio ?? 0) >= 0
                ? 'var(--color-primary)'
                : 'var(--color-danger)'
          }
        />
        <StatCard
          label={zh ? '最大回撤' : 'Max Drawdown'}
          value={pct(result.max_drawdown_pct)}
          color="var(--color-danger)"
        />
        <StatCard
          label={zh ? '总交易' : 'Trades'}
          value={String(result.total_trades)}
          color="var(--color-text)"
        />
        <StatCard
          label={zh ? '均盈 pips' : 'Avg Win Pips'}
          value={num(result.avg_win_pips, 1)}
          color="var(--color-success)"
        />
        <StatCard
          label={zh ? '均亏 pips' : 'Avg Loss Pips'}
          value={num(result.avg_loss_pips, 1)}
          color="var(--color-danger)"
        />
        <StatCard
          label={zh ? '均盈亏比' : 'Avg R:R'}
          value={num(result.avg_rr)}
          color="var(--color-accent)"
        />
        <StatCard
          label={zh ? '期望值' : 'Expected Value'}
          value={pct(result.expected_value_pct)}
          color={
            (result.expected_value_pct ?? 0) > 0
              ? 'var(--color-success)'
              : 'var(--color-danger)'
          }
        />
      </div>

      {/* Equity curve */}
      {result.equity_curve && result.equity_curve.length > 1 && (
        <EquityCurveChart curve={result.equity_curve} language={language} />
      )}

      {/* AI decision log */}
      {simResult && (simResult.steps?.length ?? 0) > 0 && (
        <Accordion
          icon={
            <Bot
              className="w-4 h-4"
              style={{ color: 'var(--color-primary)' }}
            />
          }
          label={`${zh ? 'AI 决策日志' : 'AI Decision Log'} (${simResult.steps.filter((s) => s.signal).length}/${simResult.steps.length})`}
          open={showSteps}
          onToggle={() => setShowSteps(!showSteps)}
        >
          <div
            className="overflow-x-auto"
            style={{ background: 'var(--color-bg)' }}
          >
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A344A' }}>
                  {[
                    zh ? '时间' : 'Time',
                    zh ? '价格' : 'Price',
                    zh ? '信号' : 'Signal',
                    zh ? '置信' : 'Conf',
                    zh ? '推理摘要' : 'Reasoning',
                    'ms',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(simResult?.steps ?? []).map((step, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1A2236' }}>
                    <td
                      className="px-3 py-1.5 font-mono text-xs whitespace-nowrap"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {new Date(step.time).toLocaleDateString()}
                    </td>
                    <td
                      className="px-3 py-1.5 font-mono"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {step.price.toFixed(5)}
                    </td>
                    <td className="px-3 py-1.5">
                      {step.signal ? (
                        <span
                          style={{
                            color:
                              step.signal.side === 'long'
                                ? 'var(--color-success)'
                                : 'var(--color-danger)',
                          }}
                        >
                          {step.signal.side === 'long' ? '▲ LONG' : '▼ SHORT'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-muted)' }}>—</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-1.5 font-mono"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {step.signal ? `${step.signal.confidence}%` : '—'}
                    </td>
                    <td
                      className="px-3 py-1.5"
                      style={{
                        color: 'var(--color-muted)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {step.ai_reasoning ?? '—'}
                    </td>
                    <td
                      className="px-3 py-1.5 font-mono"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {step.duration_ms}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Accordion>
      )}

      {/* Monte Carlo */}
      {result.monte_carlo_result && (
        <Accordion
          icon={
            <Activity
              className="w-4 h-4"
              style={{ color: 'var(--color-accent)' }}
            />
          }
          label={`${zh ? '蒙特卡洛' : 'Monte Carlo'} (${result.monte_carlo_result.runs.toLocaleString()} ${zh ? '次' : 'runs'})`}
          open={showMC}
          onToggle={() => setShowMC(!showMC)}
        >
          <MonteCarloDisplay
            mc={result.monte_carlo_result}
            language={language}
          />
        </Accordion>
      )}

      {/* Trades */}
      {result.trades?.length > 0 && (
        <Accordion
          icon={
            <BarChart3
              className="w-4 h-4"
              style={{ color: 'var(--color-primary)' }}
            />
          }
          label={`${zh ? '交易记录' : 'Trade Log'} (${result.trades.length})`}
          open={showTrades}
          onToggle={() => setShowTrades(!showTrades)}
        >
          <div
            className="overflow-x-auto"
            style={{ background: 'var(--color-bg)' }}
          >
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A344A' }}>
                  {[
                    '#',
                    zh ? '方向' : 'Side',
                    zh ? '入场' : 'Entry',
                    zh ? '出场' : 'Exit',
                    'Pips',
                    'P&L',
                    '%',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.trades.slice(0, 100).map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1A2236' }}>
                    <td
                      className="px-3 py-1.5"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {i + 1}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        style={{
                          color:
                            t.side === 'long'
                              ? 'var(--color-success)'
                              : 'var(--color-danger)',
                        }}
                      >
                        {t.side === 'long' ? '▲' : '▼'} {t.side.toUpperCase()}
                      </span>
                    </td>
                    <td
                      className="px-3 py-1.5 font-mono"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {t.entry_price.toFixed(5)}
                    </td>
                    <td
                      className="px-3 py-1.5 font-mono"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {t.exit_price.toFixed(5)}
                    </td>
                    <td
                      className="px-3 py-1.5 font-mono"
                      style={{
                        color:
                          t.pips >= 0
                            ? 'var(--color-success)'
                            : 'var(--color-danger)',
                      }}
                    >
                      {t.pips >= 0 ? '+' : ''}
                      {t.pips.toFixed(1)}
                    </td>
                    <td
                      className="px-3 py-1.5 font-mono"
                      style={{
                        color:
                          t.pnl_usd >= 0
                            ? 'var(--color-success)'
                            : 'var(--color-danger)',
                      }}
                    >
                      {t.pnl_usd >= 0 ? '+' : ''}
                      {usd(t.pnl_usd)}
                    </td>
                    <td
                      className="px-3 py-1.5 font-mono"
                      style={{
                        color:
                          t.pnl_pct >= 0
                            ? 'var(--color-success)'
                            : 'var(--color-danger)',
                      }}
                    >
                      {t.pnl_pct >= 0 ? '+' : ''}
                      {pct(t.pnl_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Accordion>
      )}
    </div>
  )
}

// ── Shared sub-components ───────────────────────────────────────────────────

function Accordion({
  icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid #2A344A' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            {label}
          </span>
        </div>
        {open ? (
          <ChevronDown
            className="w-4 h-4"
            style={{ color: 'var(--color-muted)' }}
          />
        ) : (
          <ChevronRight
            className="w-4 h-4"
            style={{ color: 'var(--color-muted)' }}
          />
        )}
      </button>
      {open && children}
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div
      className="p-3 rounded-lg"
      style={{ background: 'var(--color-bg)', border: '1px solid #2A344A' }}
    >
      <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
      <p className="text-lg font-mono font-semibold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function EquityCurveChart({
  curve,
  language,
}: {
  curve: { time: string; equity: number }[]
  language: string
}) {
  const zh = language === 'zh'
  const values = curve.map((p) => p.equity)
  const min = Math.min(...values),
    max = Math.max(...values)
  const range = max - min || 1
  const w = 600,
    h = 120
  const pts = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`
    )
    .join(' ')
  const profitable = values[values.length - 1] >= values[0]
  return (
    <div
      className="p-4 rounded-lg"
      style={{ background: 'var(--color-bg)', border: '1px solid #2A344A' }}
    >
      <p
        className="text-xs mb-3 font-medium"
        style={{ color: 'var(--color-muted)' }}
      >
        {zh ? '权益曲线' : 'Equity Curve'}
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 100 }}>
        <polyline
          points={pts}
          fill="none"
          stroke={profitable ? 'var(--color-success)' : 'var(--color-danger)'}
          strokeWidth="2"
        />
      </svg>
      <div
        className="flex justify-between mt-1 text-xs font-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        <span>{usd(values[0])}</span>
        <span
          style={{
            color: profitable ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {usd(values[values.length - 1])}
        </span>
      </div>
    </div>
  )
}

function MonteCarloDisplay({
  mc,
  language,
}: {
  mc: MonteCarloResult
  language: string
}) {
  const zh = language === 'zh'
  return (
    <div className="p-4 space-y-3" style={{ background: 'var(--color-bg)' }}>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={zh ? '中位收益' : 'Median Return'}
          value={pct(mc.median_return_pct)}
          color={
            mc.median_return_pct > 0
              ? 'var(--color-success)'
              : 'var(--color-danger)'
          }
        />
        <StatCard
          label={zh ? '5th 百分位' : '5th Pct'}
          value={pct(mc.p5_return_pct)}
          color="var(--color-danger)"
        />
        <StatCard
          label={zh ? '95th 百分位' : '95th Pct'}
          value={pct(mc.p95_return_pct)}
          color="var(--color-success)"
        />
        <StatCard
          label={zh ? '中位最大回撤' : 'Median Max DD'}
          value={pct(mc.median_max_dd)}
          color="var(--color-primary)"
        />
        <StatCard
          label={zh ? '最坏回撤' : 'Worst-Case DD'}
          value={pct(mc.p95_max_dd)}
          color="var(--color-danger)"
        />
        <StatCard
          label={zh ? '破产概率' : 'Ruin Prob'}
          value={pct(mc.ruin_probability)}
          color={
            mc.ruin_probability < 0.05
              ? 'var(--color-success)'
              : 'var(--color-danger)'
          }
        />
      </div>
      {mc.ruin_probability > 0.1 && (
        <div
          className="flex items-center gap-2 p-3 rounded"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
          }}
        >
          <AlertTriangle
            className="w-4 h-4 flex-shrink-0"
            style={{ color: 'var(--color-danger)' }}
          />
          <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
            {zh
              ? `破产概率 ${pct(mc.ruin_probability)} 偏高，建议降低每笔风险`
              : `Ruin probability ${pct(mc.ruin_probability)} is elevated. Reduce risk % per trade.`}
          </p>
        </div>
      )}
    </div>
  )
}
