import React, { useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLeaderboard } from '../../hooks/useTraderData'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'

function medal(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

export function CompetitionScreen() {
  const { data: entries = [], isLoading, mutate, error } = useLeaderboard()
  const onRefresh = useCallback(() => mutate(), [mutate])

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Leaderboard</Text>
          <Text style={styles.subtitle}>Live trader rankings by P&L</Text>
        </View>

        {isLoading && entries.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : error || entries.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>{error ? 'Competition data unavailable' : 'No competition data yet'}</Text>
            <Text style={styles.emptyHint}>{error ? 'The leaderboard requires public traders.' : 'Traders appear here once they have completed trades.'}</Text>
          </Card>
        ) : (
          <>
            {entries.length >= 3 && (
              <View style={styles.podium}>
                {[entries[1], entries[0], entries[2]].map((entry, i) => {
                  const heights = [60, 90, 44]
                  const bgColors = ['rgba(156,163,175,0.3)', 'rgba(245,158,11,0.3)', 'rgba(205,127,50,0.3)']
                  const pnlColor = entry.total_pnl_pct >= 0 ? colors.green : colors.red
                  return (
                    <View key={entry.trader_id} style={styles.podiumSlot}>
                      <Text style={styles.podiumMedal}>{['🥈','🥇','🥉'][i]}</Text>
                      <Text style={styles.podiumName} numberOfLines={1}>{entry.trader_name}</Text>
                      <Text style={[styles.podiumPnl, { color: pnlColor }]}>
                        {entry.total_pnl_pct >= 0 ? '+' : ''}{entry.total_pnl_pct.toFixed(2)}%
                      </Text>
                      <View style={[styles.podiumBar, { height: heights[i], backgroundColor: bgColors[i] }]} />
                    </View>
                  )
                })}
              </View>
            )}

            <Card style={styles.table}>
              <View style={[styles.row, styles.rowHeader]}>
                <Text style={[styles.cellRank, styles.headerText]}>Rank</Text>
                <Text style={[styles.cellName, styles.headerText]}>Trader</Text>
                <Text style={[styles.cellNum, styles.headerText, styles.right]}>PnL%</Text>
                <Text style={[styles.cellNum, styles.headerText, styles.right]}>WR</Text>
                <Text style={[styles.cellNum, styles.headerText, styles.right]}>Trades</Text>
              </View>
              {entries.map((entry, i) => {
                const pnlColor = entry.total_pnl_pct >= 0 ? colors.green : colors.red
                return (
                  <View key={entry.trader_id} style={[styles.row, i < entries.length - 1 && styles.rowDivider]}>
                    <Text style={[styles.cellRank, styles.cell]}>{medal(entry.rank)}</Text>
                    <View style={[styles.cellName, { flexDirection: 'row', alignItems: 'center', gap: spacing[1] }]}>
                      <Text style={[styles.cell, { flex: 1 }]} numberOfLines={1}>{entry.trader_name}</Text>
                      {entry.is_running && <Badge label="LIVE" variant="success" style={{ flexShrink: 0 }} />}
                    </View>
                    <Text style={[styles.cellNum, styles.cell, styles.right, { color: pnlColor }]}>
                      {entry.total_pnl_pct >= 0 ? '+' : ''}{entry.total_pnl_pct.toFixed(2)}%
                    </Text>
                    <Text style={[styles.cellNum, styles.cell, styles.right, { color: entry.win_rate >= 50 ? colors.green : colors.red }]}>
                      {entry.win_rate.toFixed(0)}%
                    </Text>
                    <Text style={[styles.cellNum, styles.cell, styles.right, { color: colors.textSecondary }]}>{entry.total_trades}</Text>
                  </View>
                )
              })}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10] },
  header: { marginBottom: spacing[5] },
  title: { color: colors.gold, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace', letterSpacing: 1 },
  subtitle: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginTop: 4 },
  loader: { marginTop: spacing[10] },
  emptyCard: { alignItems: 'center', paddingVertical: spacing[8] },
  emptyText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginBottom: spacing[2] },
  emptyHint: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, textAlign: 'center', lineHeight: 18 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing[2], marginBottom: spacing[5] },
  podiumSlot: { flex: 1, alignItems: 'center', gap: spacing[1] },
  podiumMedal: { fontSize: 28 },
  podiumName: { color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold, textAlign: 'center' },
  podiumPnl: { fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  podiumBar: { width: '100%', borderRadius: radius.sm },
  table: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  rowHeader: { backgroundColor: 'rgba(255,255,255,0.03)' },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
  headerText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  cell: { color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  cellRank: { width: 40, textAlign: 'center' },
  cellName: { flex: 1 },
  cellNum: { width: 54, fontFamily: 'monospace', fontSize: fontSize.xs },
  right: { textAlign: 'right' },
})
