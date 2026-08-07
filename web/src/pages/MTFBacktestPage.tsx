import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import {
  Play, RefreshCw, Bot, Zap, TrendingUp, TrendingDown,
  BarChart3, Activity, ChevronDown, ChevronRight, Sparkles,
  AlertTriangle, Database, Layers,
} from 'lucide-react'
import type {
  AIModel, StrategyConfig,
  MTFBacktestRequest, MTFBacktestResult, MTFImproveResponse,
  MTFStepLog, MTFTradeResult,
} from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || ''

// ── helpers ──────────────────────────────────────────────────────────────────
function pct(v?: number | null) { return ((v ?? 0) * 100).toFixed(2) + '%' }
function usd(v?: number | null) { return '$' + (v ?? 0).toFixed(2) }
function num(v?: number | null, d = 2) { return (v ?? 0).toFixed(d) }
function clr(v: number, posGood = true) {
  if (v > 0) return posGood ? 'var(--color-success)' : 'var(--color-danger)'
  if (v < 0) return posGood ? 'var(--color-danger)' : 'var(--color-success)'
  return 'var(--color-muted)'
}

const VARIANTS = ['conservative', 'balanced', 'aggressive'] as const
const MTF_STACK = ['4h', '1h', '15m', '5m']
const FOREX_PAIRS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD',
  'GBPJPY', 'EURJPY', 'XAUUSD', 'USOIL',
]
const CRYPTO_PAIRS = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD']

// ── MTF alignment badge ───────────────────────────────────────────────────────
function AlignBadge({ alignment }: { alignment: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    full_long:     { label: '▲ Full Long',     color: 'var(--color-success)', bg: 'rgba(16,185,129,0.12)' },
    full_short:    { label: '▼ Full Short',    color: 'var(--color-danger)',  bg: 'rgba(239,68,68,0.12)'  },
    partial_long:  { label: '↑ Partial Long',  color: 'var(--color-success)', bg: 'rgba(16,185,129,0.07)' },
    partial_short: { label: '↓ Partial Short', color: 'var(--color-danger)',  bg: 'rgba(239,68,68,0.07)'  },
    none:          { label: '— No Signal',     color: 'var(--color-muted)',   bg: 'transparent'            },
  }
  const t = map[alignment] ?? map.none
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-medium"
      style={{ color: t.color, background: t.bg }}>
      {t.label}
    </span>
  )
}

// ── TF trend pill ─────────────────────────────────────────────────────────────
function TrendPill({ label, value }: { label: string; value: string }) {
  const color = value === 'bullish' ? 'var(--color-success)'
    : value === 'bearish' ? 'var(--color-danger)'
    : 'var(--color-muted)'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span className="text-[10px] font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}

// ── Equity curve ──────────────────────────────────────────────────────────────
function EquityCurve({ curve }: { curve: { time: string; equity: number }[] }) {
  if (!curve || curve.length < 2) return null
  const vals = curve.map(p => p.equity)
  const mn = Math.min(...vals), mx = Math.max(...vals)
  const range = mx - mn || 1
  const W = 800, H = 140
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1)) * W},${H - ((v - mn) / range) * H}`
  ).join(' ')
  const up = vals[vals.length - 1] >= vals[0]
  const stroke = up ? 'var(--color-success)' : 'var(--color-danger)'
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
      <p className="text-xs font-medium mb-3" style={{ color: 'var(--color-muted)' }}>Equity Curve</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
        <defs>
          <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-xs font-mono mt-1" style={{ color: 'var(--color-muted)' }}>
        <span>{usd(vals[0])}</span>
        <span style={{ color: stroke }}>{usd(vals[vals.length - 1])}</span>
      </div>
    </div>
  )
}

// ── MTF signal viz bar ────────────────────────────────────────────────────────
function MTFBar({ log }: { log: MTFStepLog }) {
  const s = log.mtf_summary
  return (
    <div className="flex items-center gap-2 p-2 rounded text-xs" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
      <span className="font-mono text-[10px] w-20 flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
        {new Date(log.time).toLocaleDateString()}
      </span>
      <span className="font-mono w-16 flex-shrink-0" style={{ color: 'var(--color-text)' }}>
        {log.price.toFixed(5)}
      </span>
      <div className="flex gap-1 flex-shrink-0">
        {MTF_STACK.map(tf => {
          const val = tf === '4h' ? s.h4_trend : tf === '1h' ? s.h1_trend
            : tf === '15m' ? (s.m15_setup.includes('long') ? 'bullish' : s.m15_setup.includes('short') ? 'bearish' : 'neutral')
            : (s.m5_signal.includes('long') ? 'bullish' : s.m5_signal.includes('short') ? 'bearish' : 'neutral')
          const bg = val === 'bullish' ? 'rgba(16,185,129,0.2)' : val === 'bearish' ? 'rgba(239,68,68,0.2)' : 'var(--color-border)'
          const fg = val === 'bullish' ? 'var(--color-success)' : val === 'bearish' ? 'var(--color-danger)' : 'var(--color-muted)'
          return (
            <span key={tf} className="px-1.5 py-0.5 rounded text-[9px] font-bold"
              style={{ background: bg, color: fg }}>{tf.toUpperCase()}</span>
          )
        })}
      </div>
      <AlignBadge alignment={log.alignment} />
      {log.signal && (
        <span className="ml-auto font-semibold" style={{ color: log.signal.side === 'long' ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {log.signal.side === 'long' ? '▲' : '▼'} {log.signal.side.toUpperCase()} @{log.signal.entry_price.toFixed(5)}
        </span>
      )}
    </div>
  )
}

// ── Accordion helper ──────────────────────────────────────────────────────────
function Accordion({ icon, label, open, toggle, children }: {
  icon: React.ReactNode; label: string; open: boolean; toggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      <button onClick={toggle} className="w-full flex items-center justify-between p-3"
        style={{ background: 'var(--color-card)' }}>
        <div className="flex items-center gap-2">{icon}
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />
          : <ChevronRight className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />}
      </button>
      {open && children}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
      <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>{label}</p>
      <p className="text-lg font-mono font-semibold" style={{ color: color ?? 'var(--color-text)' }}>{value}</p>
    </div>
  )
}
