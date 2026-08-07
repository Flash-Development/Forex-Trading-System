// FTS — Flash Trading System — Design System
// Primary: Neon Blue #3B82F6 · Accent: Electric Cyan #22D3EE · BG: Deep Midnight #0B0F1A

export const colors = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  /** Primary action / active state — Neon Blue */
  gold: '#3B82F6',
  /** Dimmed primary for backgrounds */
  goldDim: 'rgba(59, 130, 246, 0.12)',
  /** Primary glow for shadows */
  goldGlow: 'rgba(59, 130, 246, 0.4)',
  goldHighlight: '#60A5FA',
  /** Secondary accent — Electric Cyan (AI / futuristic highlights) */
  accent: '#22D3EE',
  accentDim: 'rgba(34, 211, 238, 0.12)',

  // ── Backgrounds ────────────────────────────────────────────────────────────
  /** App background — Pure Black */
  bg: '#000000',
  /** Navigation bar / deeper surfaces */
  bgDeeper: '#000000',
  /** Cards and panels — Slate Blue-Gray */
  bgLighter: '#1A2236',
  /** Secondary background — Charcoal Navy */
  bgSecondary: '#121826',

  // ── Glass / Panels ─────────────────────────────────────────────────────────
  glass: 'rgba(11, 15, 26, 0.75)',
  /** Border / divider — Soft Graphite */
  glassBorder: '#2A344A',
  panelBg: 'rgba(26, 34, 54, 0.7)',
  panelBorder: '#2A344A',
  panelBorderHover: 'rgba(59, 130, 246, 0.5)',

  // ── Text ───────────────────────────────────────────────────────────────────
  /** Primary text — Soft White */
  textPrimary: '#E5E7EB',
  /** Secondary text — Cool Gray */
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  textDisabled: '#4B5563',

  // ── Trading ────────────────────────────────────────────────────────────────
  /** Profit / bullish — Emerald Green */
  green: '#10B981',
  greenBg: 'rgba(16, 185, 129, 0.12)',
  greenBorder: 'rgba(16, 185, 129, 0.3)',
  /** Loss / bearish — Crimson Red */
  red: '#EF4444',
  redBg: 'rgba(239, 68, 68, 0.12)',
  redBorder: 'rgba(239, 68, 68, 0.3)',
  /** Warning / risk — Amber */
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.12)',

  // ── Tab Bar ────────────────────────────────────────────────────────────────
  tabBar: '#121826',
  tabBarBorder: 'rgba(59, 130, 246, 0.15)',
} as const

export type ColorKey = keyof typeof colors
