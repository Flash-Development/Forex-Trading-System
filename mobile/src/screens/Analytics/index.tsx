import React, { useMemo, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useStatistics, useClosedPositions } from '../../hooks/useTraderData'
import { useTraderStore } from '../../stores'
import { Card } from '../../components/ui/Card'
import { StatRow } from '../../components/ui/StatRow'
import { colors, fontSize, fontWeight, spacing } from '../../theme'

// Mini horizontal bar used for long vs short breakdown
function SplitBar({ leftPct, leftColor, rightColor }: { leftPct: number; leftColor: string; rightColor: string }) {
  const clamp = Math.min(100, Math.max(0, leftPct))
  return (
    <View style={barStyles.track}>
      <View style={[barStyles.fill, { flex: clamp, backgroundColor: leftColor }]} />
      <View style={[barStyles.fill, { flex: 100 - clamp, backgroundColor: rightColor }]} />
    </View>
  )
}

const barStyles = StyleSheet.create({
  track: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.glassBorder },
  fill: {},
})

function fmt(v: number | undefined | null, dec = 2) {
  return (+(v ?? 0)).toFixed(dec)
}

function fmtPnl(v: number | undefined | null) {
  const n = +(v ?? 0)
  const sign = n >= 0 ? '+' : ''
  return sign + '$' + fmt(Math.abs(n))
}

export function AnalyticsScreen() {
  const { selectedTraderId } = useTraderStore()
  const { data: stats, isLoading: statsLoading, mutate: mutateStats } = useStatistics(selectedTraderId)
  const { data: closed = [], isLoading: closedLoading, mutate: mutateClosed } = useClosedPositions(selectedTraderId, 200)

  const isLoading = statsLoading || closedLoading
  const onRefresh = useCallback(() => { mutateStats(); mutateClosed() }, [mutateStats, mutateClosed])

  // Compute analytics from closed positions
  const analytics = useMemo(() => {
    if (!closed || closed.length === 0) return null

    const wins = closed.filter((p) => p.realized_pnl > 0)
    const losses = closed.filter((p) => p.realized_pnl <= 0)
    const longs = closed.filter((p) => p.side.toUpperCase() === 'LONG')
    const shorts = closed.filter((p) => p.side.toUpperCase() === 'SHORT')
    const longWins = longs.filter((p) => p.realized_pnl > 0)
    const shortWins = shorts.filter((p) => p.realized_pnl > 0)

    const totalPnl = closed.reduce((s, p) => s + p.realized_pnl, 0)
    const longPnl = longs.reduce((s, p) => s + p.realized_pnl, 0)
    const shortPnl = shorts.reduce((s, p) => s + p.realized_pnl, 0)

    const avgWin = wins.length ? wins.reduce((s, p) => s + p.realized_pnl, 0) / wins.length : 0
    const avgLoss = losses.length ? losses.reduce((s, p) => s + p.realized_pnl, 0) / losses.length : 0

    const sorted = [...closed].sort((a, b) => b.realized_pnl - a.realized_pnl)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]

    // Streak
    let curStreak = 0, maxWin = 0, maxLose = 0
    const byTime = [...closed].sort((a, b) => a.exit_time - b.exit_time)
    for (const p of byTime) {
      if (p.realized_pnl > 0) {
        curStreak = curStreak > 0 ? curStreak + 1 : 1
        maxWin = Math.max(maxWin, curStreak)
      } else {
        curStreak = curStreak < 0 ? curStreak - 1 : -1
        maxLose = Math.max(maxLose, -curStreak)
      }
    }

    // Symbol breakdown — top 5
    const bySymbol: Record<string, { pnl: number; count: number }> = {}
    for (const p of closed) {
      if (!bySymbol[p.symbol]) bySymbol[p.symbol] = { pnl: 0, count: 0 }
      bySymbol[p.symbol].pnl += p.realized_pnl
      bySymbol[p.symbol].count++
    }
    const topSymbols = Object.entries(bySymbol)
      .sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl))
      .slice(0, 5)

    return {
      totalPnl, longPnl, shortPnl,
      longWinRate: longs.length ? (longWins.length / longs.length) * 100 : 0,
      shortWinRate: shorts.length ? (shortWins.length / shorts.length) * 100 : 0,
      longCount: longs.length, shortCount: shorts.length,
      avgWin, avgLoss, best, worst,
      curStreak, maxWin, maxLose,
      topSymbols,
    }
  }, [closed])

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />}
        showsVerticalScrollIndicator={false}
      >
        {!selectedTraderId ? (
          <Text style={styles.empty}>Select a trader from the Traders tab</Text>
        ) : isLoading && !stats ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : (
          <>
            {/* Core metrics from backend */}
            {stats && (
              <>
                <Text style={styles.sectionLabel}>PERFORMANCE</Text>
                <Card>
                  <StatRow label="Total Trades"   value={String(stats.total_trades)} />
                  <StatRow label="Win Rate"       value={fmt(stats.win_rate, 1) + '%'} valueColor={stats.win_rate >= 50 ? colors.green : colors.red} />
                  <StatRow label="Profit Factor"  value={fmt(stats.profit_factor)} valueColor={stats.profit_factor >= 1 ? colors.green : colors.red} />
                  <StatRow label="Sharpe Ratio"   value={fmt(stats.sharpe_ratio)} valueColor={stats.sharpe_ratio >= 1 ? colors.green : colors.textPrimary} />
                  <StatRow label="Max Drawdown"   value={fmt(stats.max_drawdown_pct, 1) + '%'} valueColor={colors.red} />
                  <StatRow label="Total P&L"      value={fmtPnl(stats.total_pnl)} valueColor={stats.total_pnl >= 0 ? colors.green : colors.red} />
                  <StatRow label="Total Fees"     value={'$' + fmt(stats.total_fee)} />
                </Card>
              </>
            )}

            {/* Computed analytics from closed positions */}
            {analytics ? (
              <>
                <Text style={styles.sectionLabel}>DIRECTION BREAKDOWN</Text>
                <Card>
                  <View style={styles.splitRow}>
                    <View style={styles.splitSide}>
                      <Text style={[styles.splitLabel, { color: colors.green }]}>LONG</Text>
                      <Text style={[styles.splitPnl, { color: analytics.longPnl >= 0 ? colors.green : colors.red }]}>
                        {fmtPnl(analytics.longPnl)}
                      </Text>
                      <Text style={styles.splitMeta}>{fmt(analytics.longWinRate, 0)}% WR · {analytics.longCount} trades</Text>
                    </View>
                    <View style={[styles.splitSide, styles.splitRight]}>
                      <Text style={[styles.splitLabel, { color: colors.red }]}>SHORT</Text>
                      <Text style={[styles.splitPnl, { color: analytics.shortPnl >= 0 ? colors.green : colors.red }]}>
                        {fmtPnl(analytics.shortPnl)}
                      </Text>
                      <Text style={[styles.splitMeta, { textAlign: 'right' }]}>{fmt(analytics.shortWinRate, 0)}% WR · {analytics.shortCount} trades</Text>
                    </View>
                  </View>
                  <View style={{ marginTop: spacing[2] }}>
                    <SplitBar
                      leftPct={analytics.longCount / (analytics.longCount + analytics.shortCount) * 100}
                      leftColor={colors.green}
                      rightColor={colors.red}
                    />
                  </View>
                </Card>

                <Text style={styles.sectionLabel}>TRADE METRICS</Text>
                <Card>
                  <StatRow label="Avg Win"      value={fmtPnl(analytics.avgWin)}  valueColor={colors.green} />
                  <StatRow label="Avg Loss"     value={fmtPnl(analytics.avgLoss)} valueColor={colors.red} />
                  {analytics.best && (
                    <StatRow label="Best Trade"  value={fmtPnl(analytics.best.realized_pnl) + ' · ' + analytics.best.symbol} valueColor={colors.green} />
                  )}
                  {analytics.worst && (
                    <StatRow label="Worst Trade" value={fmtPnl(analytics.worst.realized_pnl) + ' · ' + analytics.worst.symbol} valueColor={colors.red} />
                  )}
                </Card>

                <Text style={styles.sectionLabel}>STREAKS</Text>
                <Card>
                  <StatRow label="Max Win Streak"  value={String(analytics.maxWin)}  valueColor={colors.green} />
                  <StatRow label="Max Lose Streak" value={String(analytics.maxLose)} valueColor={colors.red} />
                  <StatRow
                    label="Current Streak"
                    value={analytics.curStreak > 0 ? '+' + analytics.curStreak + ' W' : analytics.curStreak + ' L'}
                    valueColor={analytics.curStreak > 0 ? colors.green : analytics.curStreak < 0 ? colors.red : colors.textSecondary}
                  />
                </Card>

                {analytics.topSymbols.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>TOP SYMBOLS</Text>
                    <Card>
                      {analytics.topSymbols.map(([sym, data]) => (
                        <View key={sym} style={styles.symbolRow}>
                          <Text style={styles.symbolName}>{sym}</Text>
                          <Text style={styles.symbolCount}>{data.count} trades</Text>
                          <Text style={[styles.symbolPnl, { color: data.pnl >= 0 ? colors.green : colors.red }]}>
                            {fmtPnl(data.pnl)}
                          </Text>
                        </View>
                      ))}
                    </Card>
                  </>
                )}
              </>
            ) : !isLoading ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.empty}>No trade history yet</Text>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10] },
  loader: { marginTop: spacing[10] },
  empty: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing[10] },
  emptyCard: { alignItems: 'center', paddingVertical: spacing[6] },
  sectionLabel: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    marginBottom: spacing[2],
    marginTop: spacing[4],
  },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between' },
  splitSide: { flex: 1 },
  splitRight: { alignItems: 'flex-end' },
  splitLabel: { fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold, letterSpacing: 1, marginBottom: 2 },
  splitPnl: { fontFamily: 'monospace', fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  splitMeta: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginTop: 2 },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.glassBorder,
  },
  symbolName: { flex: 1, color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  symbolCount: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginRight: spacing[3] },
  symbolPnl: { fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: fontWeight.semibold, minWidth: 80, textAlign: 'right' },
})
