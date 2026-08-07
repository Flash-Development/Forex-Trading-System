import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Dimensions, PanResponder } from 'react-native'
import Svg, {
  Path, Line, Text as SvgText, Defs, LinearGradient, Stop, Circle,
} from 'react-native-svg'
import type { EquityPoint } from '../../types'
import { colors, fontSize, spacing } from '../../theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const W = SCREEN_WIDTH - spacing[4] * 2 - 32
const H = 160
const PAD = { top: 8, bottom: 28, left: 48, right: 8 }
const CHART_W = W - PAD.left - PAD.right
const CHART_H = H - PAD.top - PAD.bottom

interface Props {
  data: EquityPoint[]
  initialBalance: number
}

interface ChartPoint {
  x: number
  y: number
  equity: number
  pnlPct: number
  timestamp: string
}

export function EquityChart({ data, initialBalance }: Props) {
  const [activePt, setActivePt] = useState<ChartPoint | null>(null)

  const { points, isPositive, xLabels, yLabels } = useMemo(() => {
    if (!data || data.length < 2) {
      return { points: [] as ChartPoint[], isPositive: true, xLabels: [] as { x: number; label: string }[], yLabels: [] as { y: number; label: string }[] }
    }

    const step = Math.max(1, Math.floor(data.length / 100))
    const sampled = data.filter((_, i) => i % step === 0)

    const values = sampled.map((p) => p.total_equity)
    const minY = Math.min(...values) * 0.998
    const maxY = Math.max(...values) * 1.002
    const range = maxY - minY || 1

    const points: ChartPoint[] = sampled.map((p, i) => ({
      x: PAD.left + (i / (sampled.length - 1)) * CHART_W,
      y: PAD.top + CHART_H - ((p.total_equity - minY) / range) * CHART_H,
      equity: p.total_equity,
      pnlPct: ((p.total_equity - initialBalance) / initialBalance) * 100,
      timestamp: p.timestamp,
    }))

    const isPositive = sampled[sampled.length - 1].total_equity >= initialBalance

    const labelCount = 4
    const xLabels = Array.from({ length: labelCount }, (_, k) => {
      const idx = Math.floor((k / (labelCount - 1)) * (sampled.length - 1))
      const p = sampled[idx]
      const d = new Date(p.timestamp)
      return {
        x: PAD.left + (idx / (sampled.length - 1)) * CHART_W,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      }
    })

    const yLabels = [0, 0.5, 1].map((t) => {
      const val = minY + t * (maxY - minY)
      const y = PAD.top + CHART_H - t * CHART_H
      const label = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)
      return { y, label }
    })

    return { points, isPositive, xLabels, yLabels }
  }, [data, initialBalance])

  // Keep a ref to latest points so PanResponder always sees current data
  const pointsRef = useRef(points)
  useEffect(() => { pointsRef.current = points }, [points])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => snapToX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => snapToX(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        setTimeout(() => setActivePt(null), 1200)
      },
    })
  ).current

  const snapToX = useCallback((touchX: number) => {
    const pts = pointsRef.current
    if (!pts.length) return
    let nearest = pts[0]
    let minDist = Math.abs(pts[0].x - touchX)
    for (const p of pts) {
      const d = Math.abs(p.x - touchX)
      if (d < minDist) { minDist = d; nearest = p }
    }
    setActivePt(nearest)
  }, [])

  if (points.length < 2) {
    return (
      <View style={[styles.container, styles.empty]}>
        <Text style={styles.emptyText}>No equity history yet</Text>
      </View>
    )
  }

  const lineColor = isPositive ? colors.green : colors.red
  const gradId = isPositive ? 'greenGrad' : 'redGrad'
  const gradColor = isPositive ? '#0ECB81' : '#F6465D'

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')

  const areaPath =
    linePath +
    ` L${points[points.length - 1].x.toFixed(1)},${(PAD.top + CHART_H).toFixed(1)}` +
    ` L${points[0].x.toFixed(1)},${(PAD.top + CHART_H).toFixed(1)} Z`

  const tooltipPt = activePt ?? points[points.length - 1]
  const tooltipRight = tooltipPt.x > W * 0.6
  const tooltipX = tooltipRight ? tooltipPt.x - 102 : tooltipPt.x + 8

  return (
    <View style={styles.container}>
      {/* Tooltip */}
      {activePt && (
        <View style={[styles.tooltip, { top: Math.max(4, tooltipPt.y - 28), left: tooltipX }]}>
          <Text style={styles.tooltipDate}>
            {new Date(tooltipPt.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
          <Text style={styles.tooltipEquity}>
            ${tooltipPt.equity >= 1000
              ? (tooltipPt.equity / 1000).toFixed(2) + 'k'
              : tooltipPt.equity.toFixed(2)}
          </Text>
          <Text style={[styles.tooltipPnl, { color: tooltipPt.pnlPct >= 0 ? colors.green : colors.red }]}>
            {tooltipPt.pnlPct >= 0 ? '+' : ''}{tooltipPt.pnlPct.toFixed(2)}%
          </Text>
        </View>
      )}

      <Svg width={W} height={H} {...panResponder.panHandlers}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradColor} stopOpacity="0.18" />
            <Stop offset="1" stopColor={gradColor} stopOpacity="0.01" />
          </LinearGradient>
        </Defs>

        {/* Grid */}
        {yLabels.map((l, i) => (
          <Line key={i} x1={PAD.left} y1={l.y} x2={W - PAD.right} y2={l.y}
            stroke={colors.glassBorder} strokeWidth={1} strokeDasharray="3,4" />
        ))}

        {/* Area fill */}
        <Path d={areaPath} fill={`url(#${gradId})`} />

        {/* Line */}
        <Path d={linePath} stroke={lineColor} strokeWidth={1.5} fill="none" />

        {/* Y labels */}
        {yLabels.map((l, i) => (
          <SvgText key={i} x={PAD.left - 5} y={l.y + 4} fontSize={9}
            fill={colors.textTertiary} textAnchor="end" fontFamily="monospace">
            {l.label}
          </SvgText>
        ))}

        {/* X labels */}
        {xLabels.map((l, i) => (
          <SvgText key={i} x={l.x} y={H - 6} fontSize={9}
            fill={colors.textTertiary} textAnchor="middle" fontFamily="monospace">
            {l.label}
          </SvgText>
        ))}

        {/* Crosshair */}
        {activePt && (
          <>
            <Line x1={activePt.x} y1={PAD.top} x2={activePt.x} y2={PAD.top + CHART_H}
              stroke={lineColor} strokeWidth={1} strokeDasharray="3,3" strokeOpacity={0.6} />
            <Circle cx={activePt.x} cy={activePt.y} r={4}
              fill={lineColor} stroke={colors.bg} strokeWidth={1.5} />
          </>
        )}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginHorizontal: -spacing[1], position: 'relative' },
  empty: { height: H, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs },
  tooltip: {
    position: 'absolute',
    backgroundColor: 'rgba(18,24,38,0.92)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 10,
    minWidth: 96,
  },
  tooltipDate: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: 9, marginBottom: 2 },
  tooltipEquity: { color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: '700' },
  tooltipPnl: { fontFamily: 'monospace', fontSize: 10, fontWeight: '600', marginTop: 1 },
})
