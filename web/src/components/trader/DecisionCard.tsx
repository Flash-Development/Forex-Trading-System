import { useState } from 'react'
import type { DecisionRecord, DecisionAction } from '../../types'
import { t, type Language } from '../../i18n/translations'

interface DecisionCardProps {
  decision: DecisionRecord
  language: Language
  onSymbolClick?: (symbol: string) => void
}

// Action type configuration
const ACTION_CONFIG: Record<
  string,
  { color: string; bg: string; icon: string; label: string }
> = {
  open_long: {
    color: 'var(--color-success)',
    bg: 'rgba(16, 185, 129, 0.15)',
    icon: '📈',
    label: 'LONG',
  },
  open_short: {
    color: 'var(--color-danger)',
    bg: 'rgba(239, 68, 68, 0.15)',
    icon: '📉',
    label: 'SHORT',
  },
  close_long: {
    color: 'var(--color-primary)',
    bg: 'rgba(59, 130, 246, 0.15)',
    icon: '💰',
    label: 'CLOSE',
  },
  close_short: {
    color: 'var(--color-primary)',
    bg: 'rgba(59, 130, 246, 0.15)',
    icon: '💰',
    label: 'CLOSE',
  },
  hold: {
    color: 'var(--color-muted)',
    bg: 'rgba(132, 142, 156, 0.15)',
    icon: '⏸️',
    label: 'HOLD',
  },
  wait: {
    color: 'var(--color-muted)',
    bg: 'rgba(132, 142, 156, 0.15)',
    icon: '⏳',
    label: 'WAIT',
  },
}

// Format price with proper decimals
function formatPrice(price: number | undefined): string {
  if (!price || price === 0) return '-'
  if (price >= 1000) return price.toFixed(2)
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(6)
}

// Calculate percentage change
function calcPctChange(
  entry: number | undefined,
  target: number | undefined,
  isLong: boolean
): string {
  if (!entry || !target || entry === 0) return '-'
  const pct = ((target - entry) / entry) * 100
  const adjustedPct = isLong ? pct : -pct
  return `${adjustedPct >= 0 ? '+' : ''}${adjustedPct.toFixed(2)}%`
}

// Get confidence color
function getConfidenceColor(confidence: number | undefined): string {
  if (!confidence) return 'var(--color-muted)'
  if (confidence >= 80) return 'var(--color-success)'
  if (confidence >= 60) return 'var(--color-primary)'
  return 'var(--color-danger)'
}

// Single Action Card Component
function ActionCard({
  action,
  language,
  onSymbolClick,
}: {
  action: DecisionAction
  language: Language
  onSymbolClick?: (symbol: string) => void
}) {
  const config = ACTION_CONFIG[action.action] || ACTION_CONFIG.wait
  const isLong = action.action.includes('long')
  const isOpen = action.action.includes('open')

  return (
    <div
      className="rounded-lg p-4 transition-all duration-200 hover:scale-[1.01]"
      style={{
        background: 'linear-gradient(135deg, #1A2236 0%, #181C21 100%)',
        border: `1px solid ${config.color}33`,
        boxShadow: `0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)`,
      }}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">{config.icon}</span>
          <span
            className="font-mono font-bold text-lg cursor-pointer transition-all duration-200 hover:scale-110"
            style={{ color: 'var(--color-text)' }}
            onClick={() => onSymbolClick?.(action.symbol)}
            title="Click to view chart"
          >
            {action.symbol}
          </span>
          <span
            className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{
              background: config.bg,
              color: config.color,
              border: `1px solid ${config.color}55`,
            }}
          >
            {config.label}
          </span>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {action.confidence !== undefined && action.confidence > 0 && (
            <div
              className="px-2 py-1 rounded text-xs font-semibold"
              style={{
                background: `${getConfidenceColor(action.confidence)}22`,
                color: getConfidenceColor(action.confidence),
              }}
            >
              {action.confidence.toFixed(0)}%
            </div>
          )}
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: action.success ? 'var(--color-success)' : 'var(--color-danger)' }}
          />
        </div>
      </div>

      {/* Trading Details Grid */}
      {isOpen && (
        <div
          className="grid grid-cols-4 gap-3 mt-3 pt-3"
          style={{ borderTop: '1px solid #2A344A' }}
        >
          {/* Entry Price */}
          <div className="text-center">
            <div className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>
              {t('entryPrice', language)}
            </div>
            <div
              className="font-mono font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {formatPrice(action.price)}
            </div>
          </div>

          {/* Stop Loss */}
          <div className="text-center">
            <div className="text-xs mb-1" style={{ color: 'var(--color-danger)' }}>
              {t('stopLoss', language)}
            </div>
            <div
              className="font-mono font-semibold"
              style={{ color: 'var(--color-danger)' }}
            >
              {formatPrice(action.stop_loss)}
            </div>
            {action.stop_loss && action.price && (
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                {calcPctChange(action.price, action.stop_loss, isLong)}
              </div>
            )}
          </div>

          {/* Take Profit */}
          <div className="text-center">
            <div className="text-xs mb-1" style={{ color: 'var(--color-success)' }}>
              {t('takeProfit', language)}
            </div>
            <div
              className="font-mono font-semibold"
              style={{ color: 'var(--color-success)' }}
            >
              {formatPrice(action.take_profit)}
            </div>
            {action.take_profit && action.price && (
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                {calcPctChange(action.price, action.take_profit, isLong)}
              </div>
            )}
          </div>

          {/* Leverage */}
          <div className="text-center">
            <div className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>
              {t('leverage', language)}
            </div>
            <div
              className="font-mono font-semibold"
              style={{ color: 'var(--color-primary)' }}
            >
              {action.leverage}x
            </div>
          </div>
        </div>
      )}

      {/* Risk/Reward Ratio for open positions */}
      {isOpen && action.stop_loss && action.take_profit && action.price && (
        <div
          className="mt-3 pt-3 flex items-center justify-between"
          style={{ borderTop: '1px solid #2A344A' }}
        >
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {t('riskReward', language)}
          </span>
          <div className="flex items-center gap-2">
            {(() => {
              const slDist = Math.abs(action.price - action.stop_loss)
              const tpDist = Math.abs(action.take_profit - action.price)
              const ratio = slDist > 0 ? tpDist / slDist : 0
              const ratioColor =
                ratio >= 3 ? 'var(--color-success)' : ratio >= 2 ? 'var(--color-primary)' : 'var(--color-danger)'
              return (
                <>
                  <div className="flex gap-1">
                    <span style={{ color: 'var(--color-danger)' }}>1</span>
                    <span style={{ color: 'var(--color-muted)' }}>:</span>
                    <span style={{ color: 'var(--color-success)' }}>{ratio.toFixed(1)}</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: '60px',
                      background: 'var(--color-border)',
                    }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min((ratio / 5) * 100, 100)}%`,
                        background: ratioColor,
                      }}
                    />
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Reasoning */}
      {action.reasoning && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #2A344A' }}>
          <div className="text-xs line-clamp-2" style={{ color: 'var(--color-muted)' }}>
            💡 {action.reasoning}
          </div>
        </div>
      )}

      {/* Error Message */}
      {action.error && (
        <div
          className="mt-3 rounded p-2 text-xs"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--color-danger)',
          }}
        >
          ❌ {action.error}
        </div>
      )}
    </div>
  )
}

export function DecisionCard({
  decision,
  language,
  onSymbolClick,
}: DecisionCardProps) {
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [showInputPrompt, setShowInputPrompt] = useState(false)
  const [showCoT, setShowCoT] = useState(false)

  // Copy text to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert(`${label} copied!`)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Download text as file
  const downloadAsFile = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="rounded-xl p-5 transition-all duration-300 hover:translate-y-[-2px]"
      style={{
        border: '1px solid #2A344A',
        background: 'linear-gradient(180deg, #1A2236 0%, #181C21 100%)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(59, 130, 246, 0.15)' }}
          >
            <span className="text-xl">🤖</span>
          </div>
          <div>
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>
              {t('cycle', language)} #{decision.cycle_number}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {new Date(decision.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
        <div
          className="px-4 py-1.5 rounded-full text-xs font-bold tracking-wider"
          style={
            decision.success
              ? {
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--color-success)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }
              : {
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: 'var(--color-danger)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }
          }
        >
          {t(decision.success ? 'success' : 'failed', language)}
        </div>
      </div>

      {/* Decision Actions - Beautiful Grid */}
      {decision.decisions && decision.decisions.length > 0 && (
        <div className="space-y-3 mb-4">
          {decision.decisions.map((action, index) => (
            <ActionCard
              key={`${action.symbol}-${index}`}
              action={action}
              language={language}
              onSymbolClick={onSymbolClick}
            />
          ))}
        </div>
      )}

      {/* Collapsible Sections */}
      <div className="space-y-2">
        {/* System Prompt */}
        {decision.system_prompt && (
          <div>
            <button
              onClick={() => setShowSystemPrompt(!showSystemPrompt)}
              className="flex items-center gap-2 text-sm transition-colors w-full justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">⚙️</span>
                <span className="font-semibold" style={{ color: 'var(--color-primary-3)' }}>
                  System Prompt
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    copyToClipboard(decision.system_prompt, 'System Prompt')
                  }}
                  className="text-xs px-2.5 py-1 rounded hover:opacity-80 transition-opacity flex items-center gap-1"
                  style={{
                    background: 'rgba(167, 139, 250, 0.2)',
                    color: 'var(--color-primary-3)',
                    border: '1px solid rgba(167, 139, 250, 0.3)',
                  }}
                  title="Copy to clipboard"
                >
                  <span>📋</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    downloadAsFile(
                      decision.system_prompt,
                      `system-prompt-cycle-${decision.cycle_number}.txt`
                    )
                  }}
                  className="text-xs px-2.5 py-1 rounded hover:opacity-80 transition-opacity flex items-center gap-1"
                  style={{
                    background: 'rgba(167, 139, 250, 0.2)',
                    color: 'var(--color-primary-3)',
                    border: '1px solid rgba(167, 139, 250, 0.3)',
                  }}
                  title="Download as file"
                >
                  <span>💾</span>
                </button>
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    background: 'rgba(167, 139, 250, 0.15)',
                    color: 'var(--color-primary-3)',
                  }}
                >
                  {showSystemPrompt
                    ? t('collapse', language)
                    : t('expand', language)}
                </span>
              </div>
            </button>
            {showSystemPrompt && (
              <div
                className="mt-2 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid #2A344A',
                  color: 'var(--color-text)',
                }}
              >
                {decision.system_prompt}
              </div>
            )}
          </div>
        )}

        {/* User/Input Prompt */}
        {decision.input_prompt && (
          <div>
            <button
              onClick={() => setShowInputPrompt(!showInputPrompt)}
              className="flex items-center gap-2 text-sm transition-colors w-full justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">📥</span>
                <span className="font-semibold" style={{ color: 'var(--color-primary-3)' }}>
                  User Prompt
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    copyToClipboard(decision.input_prompt, 'User Prompt')
                  }}
                  className="text-xs px-2.5 py-1 rounded hover:opacity-80 transition-opacity flex items-center gap-1"
                  style={{
                    background: 'rgba(96, 165, 250, 0.2)',
                    color: 'var(--color-primary-3)',
                    border: '1px solid rgba(96, 165, 250, 0.3)',
                  }}
                  title="Copy to clipboard"
                >
                  <span>📋</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    downloadAsFile(
                      decision.input_prompt,
                      `user-prompt-cycle-${decision.cycle_number}.txt`
                    )
                  }}
                  className="text-xs px-2.5 py-1 rounded hover:opacity-80 transition-opacity flex items-center gap-1"
                  style={{
                    background: 'rgba(96, 165, 250, 0.2)',
                    color: 'var(--color-primary-3)',
                    border: '1px solid rgba(96, 165, 250, 0.3)',
                  }}
                  title="Download as file"
                >
                  <span>💾</span>
                </button>
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    background: 'rgba(96, 165, 250, 0.15)',
                    color: 'var(--color-primary-3)',
                  }}
                >
                  {showInputPrompt
                    ? t('collapse', language)
                    : t('expand', language)}
                </span>
              </div>
            </button>
            {showInputPrompt && (
              <div
                className="mt-2 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid #2A344A',
                  color: 'var(--color-text)',
                }}
              >
                {decision.input_prompt}
              </div>
            )}
          </div>
        )}

        {/* AI Thinking */}
        {decision.cot_trace && (
          <div>
            <button
              onClick={() => setShowCoT(!showCoT)}
              className="flex items-center gap-2 text-sm transition-colors w-full justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🧠</span>
                <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {t('aiThinking', language)}
                </span>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: 'var(--color-primary)',
                }}
              >
                {showCoT ? t('collapse', language) : t('expand', language)}
              </span>
            </button>
            {showCoT && (
              <div
                className="mt-2 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid #2A344A',
                  color: 'var(--color-text)',
                }}
              >
                {decision.cot_trace}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Execution Log */}
      {decision.execution_log && decision.execution_log.length > 0 && (
        <div
          className="rounded-lg p-3 mt-4 text-xs font-mono space-y-1"
          style={{ background: 'var(--color-bg)', border: '1px solid #2A344A' }}
        >
          {decision.execution_log.map((log, index) => (
            <div key={`${log}-${index}`} style={{ color: 'var(--color-text)' }}>
              {log}
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {decision.error_message && (
        <div
          className="rounded-lg p-3 mt-4 text-sm"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--color-danger)',
          }}
        >
          ❌ {decision.error_message}
        </div>
      )}
    </div>
  )
}
