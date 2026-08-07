import React, { useMemo, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, RefreshControl,
  ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePositions, useTraders } from '../../hooks/useTraderData.ts'
import { useTraderStore, useAuthStore } from '../../stores'
import { Card } from '../../components/ui/Card.tsx'
import { Badge } from '../../components/ui/Badge.tsx'
import { StatRow } from '../../components/ui/StatRow.tsx'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { Position } from '../../types'

// ─── sort options ──────────────────────────────────────────────────────────
type SortKey = 'pnl' | 'pnl_pct' | 'margin' | 'symbol'
type SortDir = 'asc' | 'desc'
type SideFilter = 'all' | 'long' | 'short'

function sortPositions(positions: Position[], key: SortKey, dir: SortDir): Position[] {
  return [...positions].sort((a, b) => {
    let av = 0, bv = 0
    switch (key) {
      case 'pnl':     av = a.unrealized_pnl;     bv = b.unrealized_pnl;     break
      case 'pnl_pct': av = a.unrealized_pnl_pct; bv = b.unrealized_pnl_pct; break
      case 'margin':  av = a.margin_used;         bv = b.margin_used;        break
      case 'symbol':  return dir === 'asc'
        ? a.symbol.localeCompare(b.symbol)
        : b.symbol.localeCompare(a.symbol)
    }
    return dir === 'asc' ? av - bv : bv - av
  })
}

// ─── pill button ───────────────────────────────────────────────────────────
function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

// ─── sort button ───────────────────────────────────────────────────────────
function SortBtn({
  label, sortKey, current, dir, onPress,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onPress: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={() => onPress(sortKey)}
      activeOpacity={0.7}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}{active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
      </Text>
    </TouchableOpacity>
  )
}

// ─── position card ─────────────────────────────────────────────────────────
const PositionCard = React.memo(function PositionCard({ pos }: { pos: Position }) {
  const isLong = pos.side.toLowerCase() === 'long'
  const pnlColor = pos.unrealized_pnl >= 0 ? colors.green : colors.red
  const pnlSign = pos.unrealized_pnl >= 0 ? '+' : ''
  const pctSign = pos.unrealized_pnl_pct >= 0 ? '+' : ''

  return (
    <Card style={styles.card}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.symbol}>{pos.symbol}</Text>
          <Text style={styles.leverage}>{pos.leverage}x</Text>
        </View>
        <Badge
          label={pos.side.toUpperCase()}
          variant={isLong ? 'success' : 'danger'}
        />
      </View>

      {/* PnL highlight */}
      <View style={[styles.pnlBanner, { backgroundColor: pos.unrealized_pnl >= 0 ? colors.greenBg : colors.redBg }]}>
        <Text style={[styles.pnlValue, { color: pnlColor }]}>
          {pnlSign}${Math.abs(pos.unrealized_pnl).toFixed(2)}
        </Text>
        <Text style={[styles.pnlPct, { color: pnlColor }]}>
          {pctSign}{pos.unrealized_pnl_pct.toFixed(2)}%
        </Text>
      </View>

      {/* Details */}
      <StatRow label="Entry Price"  value={`$${pos.entry_price.toFixed(4)}`} />
      <StatRow label="Mark Price"   value={`$${pos.mark_price.toFixed(4)}`} />
      <StatRow label="Size"         value={String(pos.quantity)} />
      <StatRow label="Margin Used"  value={`$${pos.margin_used.toFixed(2)}`} />
      <StatRow
        label="Liq. Price"
        value={`$${pos.liquidation_price.toFixed(4)}`}
        valueColor={colors.red}
      />
    </Card>
  )
})

// ─── main screen ───────────────────────────────────────────────────────────
export function PositionsScreen() {
  const { token } = useAuthStore()
  const { selectedTraderId, setSelectedTrader } = useTraderStore()

  const { data: traderList = [] } = useTraders(!!token)
  const { data: positions, isLoading, mutate } = usePositions(selectedTraderId)
  const safePositions: Position[] = Array.isArray(positions) ? positions : []

  const [sideFilter, setSideFilter] = useState<SideFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('pnl')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const onRefresh = useCallback(() => mutate(), [mutate])

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
      else setSortDir('desc')
      return key
    })
  }, [])

  const filtered = useMemo(() => {
    let list = safePositions
    if (sideFilter !== 'all') list = list.filter((p) => p.side.toLowerCase() === sideFilter)
    return sortPositions(list, sortKey, sortDir)
  }, [safePositions, sideFilter, sortKey, sortDir])

  // Summary totals
  const totalPnl = filtered.reduce((s, p) => s + p.unrealized_pnl, 0)
  const totalMargin = filtered.reduce((s, p) => s + p.margin_used, 0)
  const longCount = safePositions.filter((p) => p.side.toLowerCase() === 'long').length
  const shortCount = safePositions.filter((p) => p.side.toLowerCase() === 'short').length

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={colors.gold}
            colors={[colors.gold]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Position count subtitle */}
        {safePositions.length > 0 && (
          <View style={styles.header}>
            <Text style={styles.subtitle}>{safePositions.length} open · {longCount}L / {shortCount}S</Text>
          </View>
        )}

        {/* Trader filter */}
        {traderList.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterContent}
          >
            {traderList.map((t) => (
              <Pill
                key={t.trader_id}
                label={t.trader_name}
                active={selectedTraderId === t.trader_id}
                onPress={() => setSelectedTrader(t.trader_id)}
              />
            ))}
          </ScrollView>
        )}

        {/* Summary bar */}
        {safePositions.length > 0 && (
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Unrealized PnL</Text>
                <Text style={[styles.summaryValue, { color: totalPnl >= 0 ? colors.green : colors.red }]}>
                  {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.summaryItem, styles.summaryItemRight]}>
                <Text style={styles.summaryLabel}>Total Margin</Text>
                <Text style={styles.summaryValue}>${totalMargin.toFixed(2)}</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Side filter */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            <Pill label="All"   active={sideFilter === 'all'}   onPress={() => setSideFilter('all')} />
            <Pill label="Long"  active={sideFilter === 'long'}  onPress={() => setSideFilter('long')} />
            <Pill label="Short" active={sideFilter === 'short'} onPress={() => setSideFilter('short')} />
          </ScrollView>
        </View>

        {/* Sort bar */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            <Text style={styles.sortLabel}>Sort:</Text>
            <SortBtn label="PnL $"   sortKey="pnl"     current={sortKey} dir={sortDir} onPress={handleSort} />
            <SortBtn label="PnL %"   sortKey="pnl_pct" current={sortKey} dir={sortDir} onPress={handleSort} />
            <SortBtn label="Margin"  sortKey="margin"  current={sortKey} dir={sortDir} onPress={handleSort} />
            <SortBtn label="Symbol"  sortKey="symbol"  current={sortKey} dir={sortDir} onPress={handleSort} />
          </ScrollView>
        </View>

        {/* List */}
        {!selectedTraderId ? (
          <Text style={styles.empty}>Select a trader from the Traders tab</Text>
        ) : isLoading && safePositions.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>
            {safePositions.length === 0 ? 'No open positions' : 'No positions match the filter'}
          </Text>
        ) : (
          filtered.map((pos, i) => (
            <PositionCard key={`${pos.symbol}-${pos.side}-${i}`} pos={pos} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10] },

  header: { marginBottom: spacing[3] },
  title: {
    color: colors.gold,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    marginTop: 2,
  },

  filterRow: { marginBottom: spacing[2] },
  filterContent: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingRight: spacing[2] },
  sortLabel: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    marginRight: spacing[1],
    alignSelf: 'center',
  },

  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: 'transparent',
  },
  pillActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldDim,
  },
  pillText: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  pillTextActive: { color: colors.gold },

  summaryCard: { marginBottom: spacing[3] },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1 },
  summaryItemRight: { alignItems: 'flex-end' },
  summaryLabel: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
  },

  card: { marginBottom: spacing[3] },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  symbol: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  leverage: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    backgroundColor: colors.goldDim,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.sm,
  },

  pnlBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginBottom: spacing[2],
  },
  pnlValue: {
    fontSize: fontSize.lg,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
  },
  pnlPct: {
    fontSize: fontSize.md,
    fontFamily: 'monospace',
    fontWeight: fontWeight.semibold,
  },

  loader: { marginTop: spacing[10] },
  empty: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing[10],
  },
})
