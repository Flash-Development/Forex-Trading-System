import { useState, useEffect, useCallback } from 'react'
import { Shield, TrendingUp, AlertTriangle, Activity, Box, ChevronDown, ChevronUp } from 'lucide-react'
import type { GridRiskInfo } from '../../types'
import { gridRisk, ts } from '../../i18n/strategy-translations'

interface GridRiskPanelProps {
  traderId: string
  language?: string
  refreshInterval?: number // ms, default 5000
}

export function GridRiskPanel({
  traderId,
  language = 'en',
  refreshInterval = 5000,
}: GridRiskPanelProps) {
  const [riskInfo, setRiskInfo] = useState<GridRiskInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const fetchRiskInfo = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/traders/${traderId}/grid-risk`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      setRiskInfo(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [traderId])

  useEffect(() => {
    fetchRiskInfo()
    const interval = setInterval(fetchRiskInfo, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchRiskInfo, refreshInterval])

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'narrow': return 'var(--color-success)'
      case 'standard': return 'var(--color-primary)'
      case 'wide': return 'var(--color-bitcoin)'
      case 'volatile': return 'var(--color-danger)'
      case 'trending': return 'var(--color-primary)'
      default: return 'var(--color-muted)'
    }
  }

  const getBreakoutColor = (level: string) => {
    switch (level) {
      case 'none': return 'var(--color-success)'
      case 'short': return 'var(--color-primary)'
      case 'mid': return 'var(--color-bitcoin)'
      case 'long': return 'var(--color-danger)'
      default: return 'var(--color-muted)'
    }
  }

  const getPositionColor = (percent: number) => {
    if (percent < 50) return 'var(--color-success)'
    if (percent < 80) return 'var(--color-primary)'
    return 'var(--color-danger)'
  }

  const formatPrice = (price: number) => {
    if (price === 0) return '-'
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (price >= 1) return price.toFixed(4)
    return price.toFixed(6)
  }

  const formatUSD = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  const cardStyle = {
    background: 'var(--color-bg)',
    border: '1px solid #2A344A',
  }

  if (loading) {
    return (
      <div className="p-3 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
        {ts(gridRisk.loading, language)}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 text-center text-xs" style={{ color: 'var(--color-danger)' }}>
        {ts(gridRisk.error, language)}: {error}
      </div>
    )
  }

  if (!riskInfo) {
    return (
      <div className="p-3 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
        {ts(gridRisk.noData, language)}
      </div>
    )
  }

  return (
    <div className="rounded-lg" style={cardStyle}>
      {/* Collapsible Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--color-card)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
          <span className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>
            {ts(gridRisk.gridRisk, language)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Summary badges when collapsed */}
          <div className="flex items-center gap-2 text-xs">
            <span
              className="px-2 py-0.5 rounded"
              style={{ background: getRegimeColor(riskInfo.regime_level) + '20', color: getRegimeColor(riskInfo.regime_level) }}
            >
              {ts(gridRisk[(riskInfo.regime_level || 'standard') as keyof typeof gridRisk], language)}
            </span>
            <span className="font-mono" style={{ color: 'var(--color-text)' }}>
              {riskInfo.effective_leverage.toFixed(1)}x
            </span>
            <span
              className="font-mono"
              style={{ color: getPositionColor(riskInfo.position_percent) }}
            >
              {riskInfo.position_percent.toFixed(0)}%
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Row 1: Leverage & Position */}
          <div className="grid grid-cols-2 gap-3">
            {/* Leverage */}
            <div className="p-2 rounded" style={{ background: 'var(--color-card)' }}>
              <div className="flex items-center gap-1 mb-2">
                <TrendingUp className="w-3 h-3" style={{ color: 'var(--color-primary)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{ts(gridRisk.leverageInfo, language)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs">
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.currentLeverage, language)}</div>
                  <div className="font-mono" style={{ color: 'var(--color-text)' }}>{riskInfo.current_leverage}x</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.effectiveLeverage, language)}</div>
                  <div className="font-mono" style={{ color: 'var(--color-primary)' }}>{riskInfo.effective_leverage.toFixed(2)}x</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.recommendedLeverage, language)}</div>
                  <div
                    className="font-mono"
                    style={{ color: riskInfo.current_leverage > riskInfo.recommended_leverage ? 'var(--color-danger)' : 'var(--color-success)' }}
                  >
                    {riskInfo.recommended_leverage}x
                  </div>
                </div>
              </div>
            </div>

            {/* Position */}
            <div className="p-2 rounded" style={{ background: 'var(--color-card)' }}>
              <div className="flex items-center gap-1 mb-2">
                <Activity className="w-3 h-3" style={{ color: 'var(--color-primary)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{ts(gridRisk.positionInfo, language)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs">
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.currentPosition, language)}</div>
                  <div className="font-mono" style={{ color: 'var(--color-text)' }}>{formatUSD(riskInfo.current_position)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.maxPosition, language)}</div>
                  <div className="font-mono" style={{ color: 'var(--color-text)' }}>{formatUSD(riskInfo.max_position)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.positionPercent, language)}</div>
                  <div className="font-mono" style={{ color: getPositionColor(riskInfo.position_percent) }}>
                    {riskInfo.position_percent.toFixed(1)}%
                  </div>
                </div>
              </div>
              {/* Mini progress bar */}
              <div className="h-1 mt-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(riskInfo.position_percent, 100)}%`, background: getPositionColor(riskInfo.position_percent) }}
                />
              </div>
            </div>
          </div>

          {/* Row 2: Market State & Liquidation */}
          <div className="grid grid-cols-2 gap-3">
            {/* Market State */}
            <div className="p-2 rounded" style={{ background: 'var(--color-card)' }}>
              <div className="flex items-center gap-1 mb-2">
                <Shield className="w-3 h-3" style={{ color: 'var(--color-primary)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{ts(gridRisk.marketState, language)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.regimeLevel, language)}</div>
                  <div className="font-medium" style={{ color: getRegimeColor(riskInfo.regime_level) }}>
                    {ts(gridRisk[(riskInfo.regime_level || 'standard') as keyof typeof gridRisk], language)}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.currentPrice, language)}</div>
                  <div className="font-mono" style={{ color: 'var(--color-text)' }}>{formatPrice(riskInfo.current_price)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.breakoutLevel, language)}</div>
                  <div className="font-medium" style={{ color: getBreakoutColor(riskInfo.breakout_level) }}>
                    {ts(gridRisk[(riskInfo.breakout_level || 'none') as keyof typeof gridRisk], language)}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.breakoutDirection, language)}</div>
                  <div
                    className="font-medium"
                    style={{ color: riskInfo.breakout_direction === 'up' ? 'var(--color-success)' : riskInfo.breakout_direction === 'down' ? 'var(--color-danger)' : 'var(--color-muted)' }}
                  >
                    {riskInfo.breakout_direction ? ts(gridRisk[riskInfo.breakout_direction as keyof typeof gridRisk], language) : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Liquidation */}
            <div className="p-2 rounded" style={{ background: 'var(--color-card)' }}>
              <div className="flex items-center gap-1 mb-2">
                <AlertTriangle className="w-3 h-3" style={{ color: 'var(--color-danger)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{ts(gridRisk.liquidationInfo, language)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.liquidationPrice, language)}</div>
                  <div className="font-mono" style={{ color: 'var(--color-danger)' }}>
                    {riskInfo.liquidation_price > 0 ? formatPrice(riskInfo.liquidation_price) : '-'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.liquidationDistance, language)}</div>
                  <div className="font-mono" style={{ color: 'var(--color-danger)' }}>
                    {riskInfo.liquidation_distance > 0 ? `${riskInfo.liquidation_distance.toFixed(1)}%` : '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Box State */}
          <div className="p-2 rounded" style={{ background: 'var(--color-card)' }}>
            <div className="flex items-center gap-1 mb-2">
              <Box className="w-3 h-3" style={{ color: 'var(--color-primary)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{ts(gridRisk.boxState, language)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.shortBox, language)}</span>
                <span className="font-mono" style={{ color: 'var(--color-text)' }}>
                  {formatPrice(riskInfo.short_box_lower)} - {formatPrice(riskInfo.short_box_upper)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.midBox, language)}</span>
                <span className="font-mono" style={{ color: 'var(--color-text)' }}>
                  {formatPrice(riskInfo.mid_box_lower)} - {formatPrice(riskInfo.mid_box_upper)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-dim)' }}>{ts(gridRisk.longBox, language)}</span>
                <span className="font-mono" style={{ color: 'var(--color-text)' }}>
                  {formatPrice(riskInfo.long_box_lower)} - {formatPrice(riskInfo.long_box_upper)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
