import { useState } from 'react'
import {
  Plus,
  X,
  Database,
  TrendingUp,
  TrendingDown,
  List,
  Ban,
  Zap,
  Globe,
} from 'lucide-react'
import type { CoinSourceConfig } from '../../types'
import { coinSource, ts } from '../../i18n/strategy-translations'
import { NofxSelect } from '../ui/select'

interface CoinSourceEditorProps {
  config: CoinSourceConfig
  onChange: (config: CoinSourceConfig) => void
  disabled?: boolean
  language: string
}

// Common forex pairs grouped by category — always use clean symbols (no broker suffix).
// The MT5 trader translates to broker-specific symbols (e.g. EURUSDc) internally.
const FOREX_MAJORS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'AUDUSD',
  'USDCAD',
  'NZDUSD',
]
const FOREX_MINORS = [
  'EURGBP',
  'EURJPY',
  'GBPJPY',
  'AUDJPY',
  'CADJPY',
  'CHFJPY',
  'EURAUD',
  'EURCHF',
]
const FOREX_COMMODITIES = ['XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL']

export function CoinSourceEditor({
  config,
  onChange,
  disabled,
  language,
}: CoinSourceEditorProps) {
  const [newCoin, setNewCoin] = useState('')
  const [newExcludedCoin, setNewExcludedCoin] = useState('')
  const [newForexPair, setNewForexPair] = useState('')

  const isForexMode = config.source_type === 'forex'

  const sourceTypes = [
    { value: 'static', icon: List, color: 'var(--color-muted)' },
    { value: 'ai500', icon: Database, color: 'var(--color-primary)' },
    { value: 'oi_top', icon: TrendingUp, color: 'var(--color-success)' },
    { value: 'oi_low', icon: TrendingDown, color: 'var(--color-danger)' },
    { value: 'forex', icon: Globe, color: 'var(--color-accent)' },
  ] as const

  // xyz dex assets (stocks, forex, commodities) - should NOT get USD suffix
  const xyzDexAssets = new Set([
    // Stocks
    'TSLA',
    'NVDA',
    'AAPL',
    'MSFT',
    'META',
    'AMZN',
    'GOOGL',
    'AMD',
    'COIN',
    'NFLX',
    'PLTR',
    'HOOD',
    'INTC',
    'MSTR',
    'TSM',
    'ORCL',
    'MU',
    'RIVN',
    'COST',
    'LLY',
    'CRCL',
    'SKHX',
    'SNDK',
    // Forex
    'EUR',
    'JPY',
    // Commodities
    'GOLD',
    'SILVER',
    // Index
    'XYZ100',
  ])

  const isXyzDexAsset = (symbol: string): boolean => {
    const base = symbol
      .toUpperCase()
      .replace(/^XYZ:/, '')
      .replace(/USD$|USD$|-USD$/, '')
    return xyzDexAssets.has(base)
  }

  const MAX_STATIC_COINS = 10

  const showToast = (msg: string) => {
    const toast = document.createElement('div')
    toast.textContent = msg
    toast.className =
      'fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm z-50 shadow-lg'
    toast.style.cssText = 'background:#EF4444;color:#fff;'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  }

  const handleAddCoin = () => {
    if (!newCoin.trim()) return

    const currentCoins = config.static_coins || []
    if (currentCoins.length >= MAX_STATIC_COINS) {
      showToast(
        language === 'zh'
          ? `最多添加 ${MAX_STATIC_COINS} 个币种`
          : `Maximum ${MAX_STATIC_COINS} coins allowed`
      )
      return
    }

    const symbol = newCoin.toUpperCase().trim()

    // For xyz dex assets (stocks, forex, commodities), use xyz: prefix without USD
    let formattedSymbol: string
    if (isXyzDexAsset(symbol)) {
      // Remove xyz: prefix (case-insensitive) and any USD suffixes
      const base = symbol.replace(/^xyz:/i, '').replace(/USD$|USD$|-USD$/i, '')
      formattedSymbol = `xyz:${base}`
    } else {
      formattedSymbol = symbol.endsWith('USD') ? symbol : `${symbol}USD`
    }

    if (!currentCoins.includes(formattedSymbol)) {
      onChange({
        ...config,
        static_coins: [...currentCoins, formattedSymbol],
      })
    }
    setNewCoin('')
  }

  const handleRemoveCoin = (coin: string) => {
    onChange({
      ...config,
      static_coins: (config.static_coins || []).filter((c) => c !== coin),
    })
  }

  const handleAddExcludedCoin = () => {
    if (!newExcludedCoin.trim()) return
    const symbol = newExcludedCoin.toUpperCase().trim()

    // For xyz dex assets, use xyz: prefix without USD
    let formattedSymbol: string
    if (isXyzDexAsset(symbol)) {
      const base = symbol.replace(/^xyz:/i, '').replace(/USD$|USD$|-USD$/i, '')
      formattedSymbol = `xyz:${base}`
    } else {
      formattedSymbol = symbol.endsWith('USD') ? symbol : `${symbol}USD`
    }

    const currentExcluded = config.excluded_coins || []
    if (!currentExcluded.includes(formattedSymbol)) {
      onChange({
        ...config,
        excluded_coins: [...currentExcluded, formattedSymbol],
      })
    }
    setNewExcludedCoin('')
  }

  const handleRemoveExcludedCoin = (coin: string) => {
    onChange({
      ...config,
      excluded_coins: (config.excluded_coins || []).filter((c) => c !== coin),
    })
  }

  // NofxOS badge component
  const NofxOSBadge = () => (
    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
      NofxOS
    </span>
  )

  return (
    <div className="space-y-6">
      {/* Source Type Selector */}
      <div>
        <label className="block text-sm font-medium mb-3 text-nofx-text">
          {ts(coinSource.sourceType, language)}
        </label>
        <div className="grid grid-cols-5 gap-2">
          {sourceTypes.map(({ value, icon: Icon, color }) => (
            <button
              key={value}
              onClick={() =>
                !disabled &&
                onChange({
                  ...config,
                  source_type: value as CoinSourceConfig['source_type'],
                })
              }
              disabled={disabled}
              className={`p-4 rounded-lg border transition-all ${
                config.source_type === value
                  ? 'ring-2 ring-nofx-gold bg-nofx-gold/10'
                  : 'hover:bg-white/5 bg-nofx-bg'
              } border-nofx-gold/20`}
            >
              <Icon className="w-6 h-6 mx-auto mb-2" style={{ color }} />
              <div className="text-sm font-medium text-nofx-text">
                {ts(coinSource[value as keyof typeof coinSource], language)}
              </div>
              <div className="text-xs mt-1 text-nofx-text-muted">
                {ts(
                  coinSource[`${value}Desc` as keyof typeof coinSource],
                  language
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Static Coins - only for static mode */}
      {config.source_type === 'static' && (
        <div>
          <label className="block text-sm font-medium mb-3 text-nofx-text">
            {ts(coinSource.staticCoins, language)}
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {(config.static_coins || []).map((coin) => (
              <span
                key={coin}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-nofx-bg-lighter text-nofx-text"
              >
                {coin}
                {!disabled && (
                  <button
                    onClick={() => handleRemoveCoin(coin)}
                    className="ml-1 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!disabled && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newCoin}
                onChange={(e) => setNewCoin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCoin()}
                placeholder="BTC, ETH, SOL..."
                className="flex-1 px-4 py-2 rounded-lg bg-nofx-bg border border-nofx-gold/20 text-nofx-text"
              />
              <button
                onClick={handleAddCoin}
                className="px-4 py-2 rounded-lg flex items-center gap-2 transition-colors bg-nofx-gold text-black hover:bg-yellow-500"
              >
                <Plus className="w-4 h-4" />
                {ts(coinSource.addCoin, language)}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Forex Mode Panel */}
      {isForexMode && (
        <div
          className="p-4 rounded-lg border"
          style={{
            background: 'rgba(34, 211, 238, 0.04)',
            borderColor: 'rgba(34, 211, 238, 0.25)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Globe
              className="w-4 h-4"
              style={{ color: 'var(--color-accent)' }}
            />
            <span className="text-sm font-medium text-nofx-text">
              {ts(coinSource.forexPairs, language)}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{
                background: 'rgba(34,211,238,0.15)',
                color: 'var(--color-accent)',
                border: '1px solid rgba(34,211,238,0.3)',
              }}
            >
              MT5
            </span>
          </div>

          <p className="text-xs mb-4 text-nofx-text-muted">
            {ts(coinSource.forexPairsDesc, language)}
          </p>

          {/* Quick-add preset groups */}
          <div className="space-y-3 mb-4">
            {[
              {
                label: language === 'zh' ? '主要货币对' : 'Majors',
                pairs: FOREX_MAJORS,
                color: 'var(--color-accent)',
              },
              {
                label: language === 'zh' ? '次要货币对' : 'Minors',
                pairs: FOREX_MINORS,
                color: 'var(--color-primary)',
              },
              {
                label: language === 'zh' ? '贵金属/商品' : 'Metals/Commodities',
                pairs: FOREX_COMMODITIES,
                color: 'var(--color-success)',
              },
            ].map(({ label, pairs, color }) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium" style={{ color }}>
                    {label}
                  </span>
                  {!disabled && (
                    <button
                      onClick={() => {
                        const current = config.forex_pairs || []
                        const toAdd = pairs.filter((p) => !current.includes(p))
                        if (toAdd.length > 0)
                          onChange({
                            ...config,
                            forex_pairs: [...current, ...toAdd],
                          })
                      }}
                      className="text-[10px] px-2 py-0.5 rounded transition-colors"
                      style={{
                        background: `${color}22`,
                        color,
                        border: `1px solid ${color}44`,
                      }}
                    >
                      {language === 'zh' ? '全选' : 'Add all'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pairs.map((pair) => {
                    const active = (config.forex_pairs || []).includes(pair)
                    return (
                      <button
                        key={pair}
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return
                          const current = config.forex_pairs || []
                          onChange({
                            ...config,
                            forex_pairs: active
                              ? current.filter((p) => p !== pair)
                              : [...current, pair],
                          })
                        }}
                        className="px-2.5 py-1 rounded text-xs font-mono transition-all"
                        style={
                          active
                            ? {
                                background: `${color}22`,
                                color,
                                border: `1px solid ${color}66`,
                              }
                            : {
                                background: 'var(--color-bg)',
                                color: 'var(--color-muted)',
                                border: '1px solid #2A344A',
                              }
                        }
                      >
                        {pair}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Custom pair input */}
          {!disabled && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newForexPair}
                onChange={(e) => setNewForexPair(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newForexPair.trim()) {
                    const pair = newForexPair.trim()
                    const current = config.forex_pairs || []
                    if (!current.includes(pair))
                      onChange({ ...config, forex_pairs: [...current, pair] })
                    setNewForexPair('')
                  }
                }}
                placeholder="EURUSD, XAUUSD..."
                className="flex-1 px-3 py-2 rounded text-sm font-mono bg-nofx-bg border border-nofx-gold/20 text-nofx-text"
              />
              <button
                onClick={() => {
                  const pair = newForexPair.trim()
                  if (!pair) return
                  const current = config.forex_pairs || []
                  if (!current.includes(pair))
                    onChange({ ...config, forex_pairs: [...current, pair] })
                  setNewForexPair('')
                }}
                className="px-3 py-2 rounded flex items-center gap-1.5 text-sm transition-colors"
                style={{
                  background: 'rgba(34,211,238,0.15)',
                  color: 'var(--color-accent)',
                  border: '1px solid rgba(34,211,238,0.3)',
                }}
              >
                <Plus className="w-4 h-4" />
                {ts(coinSource.addForexPair, language)}
              </button>
            </div>
          )}

          {/* Selected pairs summary */}
          {(config.forex_pairs || []).length > 0 && (
            <div
              className="p-3 rounded"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid #2A344A',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-nofx-text-muted">
                  {language === 'zh' ? '已选' : 'Selected'}:{' '}
                  {(config.forex_pairs || []).length}{' '}
                  {language === 'zh' ? '个货币对' : 'pairs'}
                </span>
                {!disabled && (
                  <button
                    onClick={() => onChange({ ...config, forex_pairs: [] })}
                    className="text-xs text-nofx-danger hover:text-red-400 transition-colors"
                  >
                    {language === 'zh' ? '清空' : 'Clear all'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(config.forex_pairs || []).map((pair) => (
                  <span
                    key={pair}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono"
                    style={{
                      background: 'rgba(34,211,238,0.1)',
                      color: 'var(--color-accent)',
                      border: '1px solid rgba(34,211,238,0.25)',
                    }}
                  >
                    {pair}
                    {!disabled && (
                      <button
                        onClick={() =>
                          onChange({
                            ...config,
                            forex_pairs: (config.forex_pairs || []).filter(
                              (p) => p !== pair
                            ),
                          })
                        }
                        className="ml-0.5 hover:text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* MT5 note */}
          <p
            className="text-xs mt-3 flex items-center gap-1.5"
            style={{ color: 'var(--color-muted)' }}
          >
            <span style={{ color: 'var(--color-accent)' }}>ℹ</span>
            {ts(coinSource.forexNote, language)}
          </p>
        </div>
      )}

      {/* Excluded Coins */}
      <div>
        {' '}
        <div className="flex items-center gap-2 mb-3">
          <Ban className="w-4 h-4 text-nofx-danger" />
          <label className="text-sm font-medium text-nofx-text">
            {ts(coinSource.excludedCoins, language)}
          </label>
        </div>
        <p className="text-xs mb-3 text-nofx-text-muted">
          {ts(coinSource.excludedCoinsDesc, language)}
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {(config.excluded_coins || []).map((coin) => (
            <span
              key={coin}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-nofx-danger/15 text-nofx-danger"
            >
              {coin}
              {!disabled && (
                <button
                  onClick={() => handleRemoveExcludedCoin(coin)}
                  className="ml-1 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          {(config.excluded_coins || []).length === 0 && (
            <span className="text-xs italic text-nofx-text-muted">
              {ts(coinSource.excludedNone, language)}
            </span>
          )}
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newExcludedCoin}
              onChange={(e) => setNewExcludedCoin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddExcludedCoin()}
              placeholder="BTC, ETH, DOGE..."
              className="flex-1 px-4 py-2 rounded-lg text-sm bg-nofx-bg border border-nofx-gold/20 text-nofx-text"
            />
            <button
              onClick={handleAddExcludedCoin}
              className="px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm bg-nofx-danger text-white hover:bg-red-600"
            >
              <Ban className="w-4 h-4" />
              {ts(coinSource.addExcludedCoin, language)}
            </button>
          </div>
        )}
      </div>

      {/* AI500 Options - only for ai500 mode */}
      {config.source_type === 'ai500' && (
        <div className="p-4 rounded-lg bg-nofx-gold/5 border border-nofx-gold/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-nofx-gold" />
              <span className="text-sm font-medium text-nofx-text">
                AI500 {ts(coinSource.dataSourceConfig, language)}
              </span>
              <NofxOSBadge />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.use_ai500}
                onChange={(e) =>
                  !disabled &&
                  onChange({ ...config, use_ai500: e.target.checked })
                }
                disabled={disabled}
                className="w-5 h-5 rounded accent-nofx-gold"
              />
              <span className="text-nofx-text">
                {ts(coinSource.useAI500, language)}
              </span>
            </label>

            {config.use_ai500 && (
              <div className="flex items-center gap-3 pl-8">
                <span className="text-sm text-nofx-text-muted">
                  {ts(coinSource.ai500Limit, language)}:
                </span>
                <NofxSelect
                  value={config.ai500_limit || 3}
                  onChange={(val) =>
                    !disabled &&
                    onChange({ ...config, ai500_limit: parseInt(val) || 3 })
                  }
                  disabled={disabled}
                  options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
                    value: n,
                    label: String(n),
                  }))}
                  className="px-3 py-1.5 rounded bg-nofx-bg border border-nofx-gold/20 text-nofx-text"
                />
              </div>
            )}

            <p className="text-xs pl-8 text-nofx-text-muted">
              {ts(coinSource.nofxosNote, language)}
            </p>
          </div>
        </div>
      )}

      {/* OI Top Options - only for oi_top mode */}
      {config.source_type === 'oi_top' && (
        <div className="p-4 rounded-lg bg-nofx-success/5 border border-nofx-success/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-nofx-success" />
              <span className="text-sm font-medium text-nofx-text">
                {ts(coinSource.oiIncreaseTitle, language)}{' '}
                {ts(coinSource.dataSourceConfig, language)}
              </span>
              <NofxOSBadge />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.use_oi_top}
                onChange={(e) =>
                  !disabled &&
                  onChange({ ...config, use_oi_top: e.target.checked })
                }
                disabled={disabled}
                className="w-5 h-5 rounded accent-nofx-success"
              />
              <span className="text-nofx-text">
                {ts(coinSource.useOITop, language)}
              </span>
            </label>

            {config.use_oi_top && (
              <div className="flex items-center gap-3 pl-8">
                <span className="text-sm text-nofx-text-muted">
                  {ts(coinSource.oiTopLimit, language)}:
                </span>
                <NofxSelect
                  value={config.oi_top_limit || 3}
                  onChange={(val) =>
                    !disabled &&
                    onChange({ ...config, oi_top_limit: parseInt(val) || 3 })
                  }
                  disabled={disabled}
                  options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
                    value: n,
                    label: String(n),
                  }))}
                  className="px-3 py-1.5 rounded bg-nofx-bg border border-nofx-gold/20 text-nofx-text"
                />
              </div>
            )}

            <p className="text-xs pl-8 text-nofx-text-muted">
              {ts(coinSource.nofxosNote, language)}
            </p>
          </div>
        </div>
      )}

      {/* OI Low Options - only for oi_low mode */}
      {config.source_type === 'oi_low' && (
        <div className="p-4 rounded-lg bg-nofx-danger/5 border border-nofx-danger/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-nofx-danger" />
              <span className="text-sm font-medium text-nofx-text">
                {ts(coinSource.oiDecreaseTitle, language)}{' '}
                {ts(coinSource.dataSourceConfig, language)}
              </span>
              <NofxOSBadge />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.use_oi_low}
                onChange={(e) =>
                  !disabled &&
                  onChange({ ...config, use_oi_low: e.target.checked })
                }
                disabled={disabled}
                className="w-5 h-5 rounded accent-red-500"
              />
              <span className="text-nofx-text">
                {ts(coinSource.useOILow, language)}
              </span>
            </label>

            {config.use_oi_low && (
              <div className="flex items-center gap-3 pl-8">
                <span className="text-sm text-nofx-text-muted">
                  {ts(coinSource.oiLowLimit, language)}:
                </span>
                <NofxSelect
                  value={config.oi_low_limit || 3}
                  onChange={(val) =>
                    !disabled &&
                    onChange({ ...config, oi_low_limit: parseInt(val) || 3 })
                  }
                  disabled={disabled}
                  options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
                    value: n,
                    label: String(n),
                  }))}
                  className="px-3 py-1.5 rounded bg-nofx-bg border border-nofx-gold/20 text-nofx-text"
                />
              </div>
            )}

            <p className="text-xs pl-8 text-nofx-text-muted">
              {ts(coinSource.nofxosNote, language)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
