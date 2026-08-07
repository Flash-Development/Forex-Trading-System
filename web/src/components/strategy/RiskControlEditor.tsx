import { Shield, AlertTriangle, Globe, Clock, DollarSign } from 'lucide-react'
import type { RiskControlConfig } from '../../types'
import { riskControl, ts } from '../../i18n/strategy-translations'

interface RiskControlEditorProps {
  config: RiskControlConfig
  onChange: (config: RiskControlConfig) => void
  disabled?: boolean
  language: string
  isForexMode?: boolean
}

export function RiskControlEditor({
  config,
  onChange,
  disabled,
  language,
  isForexMode = false,
}: RiskControlEditorProps) {
  const updateField = <K extends keyof RiskControlConfig>(
    key: K,
    value: RiskControlConfig[K]
  ) => {
    if (!disabled) {
      onChange({ ...config, [key]: value })
    }
  }

  const majorLabel = isForexMode
    ? language === 'zh'
      ? '主要货币对杠杆'
      : 'Major Pairs Leverage'
    : ts(riskControl.btcEthLeverage, language)
  const majorDesc = isForexMode
    ? language === 'zh'
      ? 'EUR/USD, GBP/USD 等主要货币对'
      : 'EUR/USD, GBP/USD and other major pairs'
    : ts(riskControl.btcEthLeverageDesc, language)
  const minorLabel = isForexMode
    ? language === 'zh'
      ? '次要/异国货币对杠杆'
      : 'Minor/Exotic Pairs Leverage'
    : ts(riskControl.altcoinLeverage, language)
  const minorDesc = isForexMode
    ? language === 'zh'
      ? '交叉货币对和异国货币对'
      : 'Cross pairs and exotic currency pairs'
    : ts(riskControl.altcoinLeverageDesc, language)
  const majorRatioLabel = isForexMode
    ? language === 'zh'
      ? '主要货币对仓位比例'
      : 'Major Pairs Position Ratio'
    : ts(riskControl.btcEthPositionValueRatio, language)
  const minorRatioLabel = isForexMode
    ? language === 'zh'
      ? '次要货币对仓位比例'
      : 'Minor Pairs Position Ratio'
    : ts(riskControl.altcoinPositionValueRatio, language)

  const useFixedRisk = (config.risk_usd_per_trade ?? 0) > 0

  return (
    <div className="space-y-6">
      {/* Position Limits */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Shield
            className="w-5 h-5"
            style={{ color: 'var(--color-primary)' }}
          />
          <h3 className="font-medium" style={{ color: 'var(--color-text)' }}>
            {ts(riskControl.positionLimits, language)}
          </h3>
          {isForexMode && (
            <span
              className="text-[10px] px-2 py-0.5 rounded font-medium"
              style={{
                background: 'rgba(34,211,238,0.12)',
                color: 'var(--color-accent)',
                border: '1px solid rgba(34,211,238,0.3)',
              }}
            >
              FOREX
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 mb-4">
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #10B981',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {ts(riskControl.maxPositions, language)}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {ts(riskControl.maxPositionsDesc, language)}
            </p>
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-lg"
                style={{ color: 'var(--color-success)' }}
              >
                {config.max_positions ?? 3}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                System enforced
              </span>
            </div>
          </div>
        </div>
        <div className="mb-2">
          <p
            className="text-xs font-medium mb-2"
            style={{ color: 'var(--color-primary)' }}
          >
            {ts(riskControl.tradingLeverage, language)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #2A344A',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {majorLabel}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {majorDesc}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                value={config.btc_eth_max_leverage ?? 5}
                onChange={(e) =>
                  updateField('btc_eth_max_leverage', parseInt(e.target.value))
                }
                disabled={disabled}
                min={1}
                max={20}
                className="flex-1 accent-yellow-500"
              />
              <span
                className="w-12 text-center font-mono"
                style={{ color: 'var(--color-primary)' }}
              >
                {config.btc_eth_max_leverage ?? 5}x
              </span>
            </div>
          </div>
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #2A344A',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {minorLabel}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {minorDesc}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                value={config.altcoin_max_leverage ?? 5}
                onChange={(e) =>
                  updateField('altcoin_max_leverage', parseInt(e.target.value))
                }
                disabled={disabled}
                min={1}
                max={20}
                className="flex-1 accent-yellow-500"
              />
              <span
                className="w-12 text-center font-mono"
                style={{ color: 'var(--color-primary)' }}
              >
                {config.altcoin_max_leverage ?? 5}x
              </span>
            </div>
          </div>
        </div>
        <div className="mb-2">
          <p
            className="text-xs font-medium"
            style={{ color: 'var(--color-success)' }}
          >
            {ts(riskControl.positionValueRatio, language)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            {ts(riskControl.positionValueRatioDesc, language)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #10B981',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {majorRatioLabel}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {ts(riskControl.btcEthPositionValueRatioDesc, language)}
            </p>
            <div className="flex items-center gap-2">
              <span
                className="w-12 text-center font-mono"
                style={{ color: 'var(--color-success)' }}
              >
                {config.btc_eth_max_position_value_ratio ?? 5}x
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                System enforced
              </span>
            </div>
          </div>
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #10B981',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {minorRatioLabel}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {ts(riskControl.altcoinPositionValueRatioDesc, language)}
            </p>
            <div className="flex items-center gap-2">
              <span
                className="w-12 text-center font-mono"
                style={{ color: 'var(--color-success)' }}
              >
                {config.altcoin_max_position_value_ratio ?? 1}x
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                System enforced
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Parameters */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle
            className="w-5 h-5"
            style={{ color: 'var(--color-danger)' }}
          />
          <h3 className="font-medium" style={{ color: 'var(--color-text)' }}>
            {ts(riskControl.riskParameters, language)}
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #2A344A',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {ts(riskControl.minRiskReward, language)}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {ts(riskControl.minRiskRewardDesc, language)}
            </p>
            <div className="flex items-center">
              <span style={{ color: 'var(--color-muted)' }}>1:</span>
              <input
                type="number"
                value={config.min_risk_reward_ratio ?? 3}
                onChange={(e) =>
                  updateField(
                    'min_risk_reward_ratio',
                    parseFloat(e.target.value) || 3
                  )
                }
                disabled={disabled}
                min={1}
                max={10}
                step={0.5}
                className="w-20 px-3 py-2 rounded ml-2"
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid #2A344A',
                  color: 'var(--color-text)',
                }}
              />
            </div>
          </div>
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #10B981',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {ts(riskControl.maxMarginUsage, language)}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {ts(riskControl.maxMarginUsageDesc, language)}
            </p>
            <div className="flex items-center gap-2">
              <span
                className="w-12 text-center font-mono"
                style={{ color: 'var(--color-success)' }}
              >
                {Math.round((config.max_margin_usage ?? 0.9) * 100)}%
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                System enforced
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Entry Requirements */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Shield
            className="w-5 h-5"
            style={{ color: 'var(--color-success)' }}
          />
          <h3 className="font-medium" style={{ color: 'var(--color-text)' }}>
            {ts(riskControl.entryRequirements, language)}
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #10B981',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {ts(riskControl.minPositionSize, language)}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {ts(riskControl.minPositionSizeDesc, language)}
            </p>
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-lg"
                style={{ color: 'var(--color-success)' }}
              >
                {config.min_position_size ?? 12}
              </span>
              <span className="ml-2" style={{ color: 'var(--color-muted)' }}>
                USD
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                System enforced
              </span>
            </div>
          </div>
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #2A344A',
            }}
          >
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {ts(riskControl.minConfidence, language)}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
              {ts(riskControl.minConfidenceDesc, language)}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                value={config.min_confidence ?? 75}
                onChange={(e) =>
                  updateField('min_confidence', parseInt(e.target.value))
                }
                disabled={disabled}
                min={50}
                max={100}
                className="flex-1 accent-green-500"
              />
              <span
                className="w-12 text-center font-mono"
                style={{ color: 'var(--color-success)' }}
              >
                {config.min_confidence ?? 75}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Forex Risk Management ── */}
      {isForexMode && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Globe
              className="w-5 h-5"
              style={{ color: 'var(--color-accent)' }}
            />
            <h3 className="font-medium" style={{ color: 'var(--color-text)' }}>
              {language === 'zh' ? '外汇风险管理' : 'Forex Risk Management'}
            </h3>
          </div>

          {/* Risk mode: % of equity vs fixed $ */}
          <div
            className="p-4 rounded-lg mb-4"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid rgba(34,211,238,0.3)',
            }}
          >
            <p
              className="text-sm font-medium mb-3"
              style={{ color: 'var(--color-text)' }}
            >
              {language === 'zh' ? '每笔风险模式' : 'Risk Per Trade'}
            </p>
            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                disabled={disabled}
                onClick={() =>
                  !disabled &&
                  onChange({
                    ...config,
                    risk_usd_per_trade: 0,
                    risk_pct_per_trade: config.risk_pct_per_trade ?? 0.0025,
                  })
                }
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-sm font-medium transition-all"
                style={
                  !useFixedRisk
                    ? {
                        background: 'rgba(34,211,238,0.15)',
                        color: 'var(--color-accent)',
                        border: '1px solid rgba(34,211,238,0.5)',
                      }
                    : {
                        background: 'var(--color-card)',
                        color: 'var(--color-muted)',
                        border: '1px solid #2A344A',
                      }
                }
              >
                <span className="font-bold">%</span>
                {language === 'zh' ? '百分比' : '% of Equity'}
              </button>
              <button
                disabled={disabled}
                onClick={() =>
                  !disabled &&
                  onChange({
                    ...config,
                    risk_pct_per_trade: 0,
                    risk_usd_per_trade: config.risk_usd_per_trade ?? 10,
                  })
                }
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-sm font-medium transition-all"
                style={
                  useFixedRisk
                    ? {
                        background: 'rgba(34,211,238,0.15)',
                        color: 'var(--color-accent)',
                        border: '1px solid rgba(34,211,238,0.5)',
                      }
                    : {
                        background: 'var(--color-card)',
                        color: 'var(--color-muted)',
                        border: '1px solid #2A344A',
                      }
                }
              >
                <DollarSign className="w-3.5 h-3.5" />
                {language === 'zh' ? '固定金额' : 'Fixed $'}
              </button>
            </div>

            {useFixedRisk ? (
              <div>
                <p
                  className="text-xs mb-3"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {language === 'zh'
                    ? '每笔交易固定风险金额（美元）。止损距离变化时仓位自动调整，与账户大小无关。'
                    : 'Risk exactly this many USD per trade. Lot size adjusts automatically based on stop distance.'}
                </p>
                <div className="flex items-center gap-3">
                  <span
                    className="text-xl font-medium"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    value={config.risk_usd_per_trade ?? 10}
                    onChange={(e) =>
                      updateField(
                        'risk_usd_per_trade',
                        parseFloat(e.target.value) || 1
                      )
                    }
                    disabled={disabled}
                    min={1}
                    step={1}
                    className="w-32 px-3 py-2 rounded font-mono text-xl"
                    style={{
                      background: 'var(--color-card)',
                      border: '1px solid rgba(34,211,238,0.4)',
                      color: 'var(--color-accent)',
                    }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    USD
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <p
                  className="text-xs mb-3"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {language === 'zh'
                    ? '每笔交易占账户权益的风险比例。例如 0.5% = $5000 账户每笔风险 $25。'
                    : 'Fraction of equity risked per trade. e.g. 0.5% on a $5,000 account = $25 risk.'}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    value={Math.round(
                      (config.risk_pct_per_trade ?? 0.0025) * 10000
                    )}
                    onChange={(e) =>
                      updateField(
                        'risk_pct_per_trade',
                        parseInt(e.target.value) / 10000
                      )
                    }
                    disabled={disabled}
                    min={5}
                    max={500}
                    className="flex-1"
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span
                    className="w-16 text-center font-mono text-lg"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {((config.risk_pct_per_trade ?? 0.0025) * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Drawdown / loss limits */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div
              className="p-4 rounded-lg"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid rgba(239,68,68,0.3)',
              }}
            >
              <label
                className="block text-sm mb-1"
                style={{ color: 'var(--color-text)' }}
              >
                {language === 'zh' ? '每日最大亏损' : 'Max Daily Loss'}
              </label>
              <p
                className="text-xs mb-2"
                style={{ color: 'var(--color-muted)' }}
              >
                {language === 'zh'
                  ? '当日亏损达到此比例时暂停交易'
                  : 'Halt trading when daily loss reaches this % of equity.'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  value={Math.round((config.max_daily_loss_pct ?? 0.05) * 100)}
                  onChange={(e) =>
                    updateField(
                      'max_daily_loss_pct',
                      parseInt(e.target.value) / 100
                    )
                  }
                  disabled={disabled}
                  min={1}
                  max={20}
                  className="flex-1"
                  style={{ accentColor: 'var(--color-danger)' }}
                />
                <span
                  className="w-14 text-center font-mono"
                  style={{ color: 'var(--color-danger)' }}
                >
                  {((config.max_daily_loss_pct ?? 0.05) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div
              className="p-4 rounded-lg"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid rgba(239,68,68,0.3)',
              }}
            >
              <label
                className="block text-sm mb-1"
                style={{ color: 'var(--color-text)' }}
              >
                {language === 'zh' ? '最大回撤限制' : 'Max Drawdown'}
              </label>
              <p
                className="text-xs mb-2"
                style={{ color: 'var(--color-muted)' }}
              >
                {language === 'zh'
                  ? '从权益峰值回撤超过此比例时停止交易'
                  : 'Stop trading when drawdown from equity peak exceeds this %.'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  value={Math.round((config.max_drawdown_pct ?? 0.1) * 100)}
                  onChange={(e) =>
                    updateField(
                      'max_drawdown_pct',
                      parseInt(e.target.value) / 100
                    )
                  }
                  disabled={disabled}
                  min={2}
                  max={30}
                  className="flex-1"
                  style={{ accentColor: 'var(--color-danger)' }}
                />
                <span
                  className="w-14 text-center font-mono"
                  style={{ color: 'var(--color-danger)' }}
                >
                  {((config.max_drawdown_pct ?? 0.1) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div
              className="p-4 rounded-lg"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid rgba(34,211,238,0.3)',
              }}
            >
              <label
                className="block text-sm mb-1"
                style={{ color: 'var(--color-text)' }}
              >
                {language === 'zh' ? '最大总风险敞口' : 'Max Total Risk'}
              </label>
              <p
                className="text-xs mb-2"
                style={{ color: 'var(--color-muted)' }}
              >
                {language === 'zh'
                  ? '所有持仓合计风险不超过此比例'
                  : 'Total risk across all open positions must not exceed this %.'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  value={Math.round((config.max_total_risk_pct ?? 0.06) * 100)}
                  onChange={(e) =>
                    updateField(
                      'max_total_risk_pct',
                      parseInt(e.target.value) / 100
                    )
                  }
                  disabled={disabled}
                  min={1}
                  max={20}
                  className="flex-1"
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <span
                  className="w-14 text-center font-mono"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {((config.max_total_risk_pct ?? 0.06) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Cent account toggle */}
          <div
            className="p-4 rounded-lg mb-4"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #2A344A',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--color-text)' }}
                >
                  {language === 'zh' ? '美分账户模式' : 'Cent Account Mode'}
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {language === 'zh'
                    ? '美分账户余额 × 100 = 标准美元等值（例如 $10 美分账户 = $1000 有效权益）'
                    : 'Cent account balance × 100 = standard USD equivalent (e.g. $10 cent = $1000 effective equity)'}
                </p>
              </div>
              <button
                onClick={() =>
                  !disabled &&
                  updateField('is_cent_account', !config.is_cent_account)
                }
                disabled={disabled}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                style={{
                  background: config.is_cent_account
                    ? 'var(--color-accent)'
                    : 'var(--color-border)',
                }}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  style={{
                    transform: config.is_cent_account
                      ? 'translateX(22px)'
                      : 'translateX(2px)',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Session filter */}
          <div
            className="p-4 rounded-lg"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid #2A344A',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock
                className="w-4 h-4"
                style={{ color: 'var(--color-primary)' }}
              />
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--color-text)' }}
              >
                {language === 'zh' ? '交易时段过滤' : 'Session Filter'}
              </p>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
              {language === 'zh'
                ? '仅在选定时段内执行交易。留空 = 全时段交易。'
                : 'Only execute trades during selected sessions. Empty = trade all sessions.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                {
                  id: 'london',
                  label:
                    language === 'zh' ? '伦敦 07-16 UTC' : 'London 07-16 UTC',
                },
                {
                  id: 'new_york',
                  label:
                    language === 'zh' ? '纽约 12-21 UTC' : 'New York 12-21 UTC',
                },
                {
                  id: 'london_ny_overlap',
                  label:
                    language === 'zh'
                      ? '伦纽重叠 12-16 UTC'
                      : 'London/NY 12-16 UTC',
                },
                {
                  id: 'tokyo',
                  label:
                    language === 'zh' ? '东京 00-09 UTC' : 'Tokyo 00-09 UTC',
                },
                {
                  id: 'sydney',
                  label:
                    language === 'zh' ? '悉尼 21-06 UTC' : 'Sydney 21-06 UTC',
                },
              ].map(({ id, label }) => {
                const active = (config.allowed_sessions ?? []).includes(id)
                return (
                  <button
                    key={id}
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return
                      const current = config.allowed_sessions ?? []
                      updateField(
                        'allowed_sessions',
                        active
                          ? current.filter((s) => s !== id)
                          : [...current, id]
                      )
                    }}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-all"
                    style={
                      active
                        ? {
                            background: 'rgba(59,130,246,0.15)',
                            color: 'var(--color-primary)',
                            border: '1px solid rgba(59,130,246,0.5)',
                          }
                        : {
                            background: 'var(--color-card)',
                            color: 'var(--color-muted)',
                            border: '1px solid #2A344A',
                          }
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
