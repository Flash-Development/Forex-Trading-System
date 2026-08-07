import React, { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, RefreshControl,
  ScrollView, TouchableOpacity, ActivityIndicator, Share, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useOrders, useDecisionHistory } from '../../hooks/useTraderData.ts'
import { useTraderStore } from '../../stores'
import { Card } from '../../components/ui/Card.tsx'
import { Badge } from '../../components/ui/Badge.tsx'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { TraderOrder, DecisionRecord } from '../../types/history'

// ─── helpers ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

function fmtTime(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.toLocaleDateString()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function fmtIso(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function actionColor(action: string): string {
  if (action.includes('open_long'))   return colors.green
  if (action.includes('open_short'))  return colors.red
  if (action.includes('close_long'))  return colors.textSecondary
  if (action.includes('close_short')) return colors.textSecondary
  return colors.textTertiary
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    open_long:   'OPEN LONG',
    open_short:  'OPEN SHORT',
    close_long:  'CLOSE LONG',
    close_short: 'CLOSE SHORT',
  }
  return map[action] ?? action.toUpperCase()
}

function statusVariant(status: string): 'success' | 'danger' | 'muted' | 'gold' {
  switch (status) {
    case 'FILLED':   return 'success'
    case 'CANCELED': return 'danger'
    case 'NEW':      return 'gold'
    default:         return 'muted'
  }
}

// ─── tab pill ──────────────────────────────────────────────────────────────
function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

// ─── order card ────────────────────────────────────────────────────────────
const OrderCard = React.memo(function OrderCard({ order }: { order: TraderOrder }) {
  const color = actionColor(order.order_action)
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.symbol}>{order.symbol}</Text>
          {order.leverage > 1 && (
            <Text style={styles.leverage}>{order.leverage}x</Text>
          )}
        </View>
        <Badge label={order.status} variant={statusVariant(order.status)} />
      </View>

      <Text style={[styles.action, { color }]}>{actionLabel(order.order_action)}</Text>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.fieldLabel}>Qty</Text>
          <Text style={styles.fieldValue}>{order.filled_quantity || order.quantity}</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.fieldLabel}>Avg Price</Text>
          <Text style={styles.fieldValue}>
            {order.avg_fill_price > 0 ? `$${order.avg_fill_price.toFixed(4)}` : '—'}
          </Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.fieldLabel}>Fee</Text>
          <Text style={styles.fieldValue}>
            {order.commission > 0 ? `$${order.commission.toFixed(4)}` : '—'}
          </Text>
        </View>
      </View>

      <Text style={styles.timestamp}>
        {order.filled_at ? fmtTime(order.filled_at) : fmtTime(order.created_at)}
        {order.exchange_type ? `  ·  ${order.exchange_type.toUpperCase()}` : ''}
      </Text>
    </Card>
  )
})

// ─── decision card ─────────────────────────────────────────────────────────
type CoTTab = 'actions' | 'cot' | 'log'

const DecisionCard = React.memo(function DecisionCard({ record }: { record: DecisionRecord }) {
  const [expanded, setExpanded] = useState(false)
  const [cotTab, setCotTab] = useState<CoTTab>('actions')
  const hasActions = record.decisions?.length > 0
  const hasCot = !!record.cot_trace?.trim()
  const hasLog = record.execution_log?.length > 0

  return (
    <Card style={styles.card}>
      {/* Header row — tap to expand/collapse */}
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cycleLabel}>Cycle #{record.cycle_number}</Text>
            {record.ai_request_duration_ms > 0 && (
              <Text style={styles.duration}>{(record.ai_request_duration_ms / 1000).toFixed(1)}s</Text>
            )}
          </View>
          <View style={styles.cardHeaderRight}>
            {hasCot && <Text style={styles.cotBadge}>🧠</Text>}
            <Badge
              label={record.success ? 'OK' : 'ERR'}
              variant={record.success ? 'success' : 'danger'}
            />
            <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </View>
        <Text style={styles.timestamp}>{fmtIso(record.timestamp)}</Text>
      </TouchableOpacity>

      {/* Action chips always visible */}
      {hasActions && (
        <View style={styles.actionsRow}>
          {record.decisions.map((d, i) => (
            <View key={i} style={[styles.actionChip, { borderColor: actionColor(d.action) }]}>
              <Text style={[styles.actionChipText, { color: actionColor(d.action) }]}>
                {d.symbol} {actionLabel(d.action)}
                {d.confidence != null ? ` ${d.confidence}%` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Expanded content with tab switcher */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Tab bar */}
          <View style={styles.cotTabs}>
            <TouchableOpacity
              style={[styles.cotTab, cotTab === 'actions' && styles.cotTabActive]}
              onPress={() => setCotTab('actions')}
            >
              <Text style={[styles.cotTabText, cotTab === 'actions' && styles.cotTabTextActive]}>Decisions</Text>
            </TouchableOpacity>
            {hasCot && (
              <TouchableOpacity
                style={[styles.cotTab, cotTab === 'cot' && styles.cotTabActive]}
                onPress={() => setCotTab('cot')}
              >
                <Text style={[styles.cotTabText, cotTab === 'cot' && styles.cotTabTextActive]}>🧠 Thinking</Text>
              </TouchableOpacity>
            )}
            {hasLog && (
              <TouchableOpacity
                style={[styles.cotTab, cotTab === 'log' && styles.cotTabActive]}
                onPress={() => setCotTab('log')}
              >
                <Text style={[styles.cotTabText, cotTab === 'log' && styles.cotTabTextActive]}>Log</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Decisions tab */}
          {cotTab === 'actions' && (
            <>
              {record.decisions.map((d, i) => (
                <View key={i} style={styles.reasoningBlock}>
                  <View style={styles.decisionHeaderRow}>
                    <Text style={[styles.reasoningSymbol, { color: actionColor(d.action) }]}>
                      {d.symbol} · {actionLabel(d.action)}
                    </Text>
                    {d.confidence != null && (
                      <Text style={[styles.confidenceBadge, {
                        color: d.confidence >= 75 ? colors.green : d.confidence >= 60 ? colors.warning : colors.red,
                      }]}>{d.confidence}%</Text>
                    )}
                  </View>
                  {d.stop_loss != null && d.take_profit != null && (
                    <View style={styles.slTpRow}>
                      <Text style={styles.slTpText}>SL {d.stop_loss.toFixed(4)}</Text>
                      <Text style={styles.slTpDivider}>·</Text>
                      <Text style={styles.slTpText}>TP {d.take_profit.toFixed(4)}</Text>
                    </View>
                  )}
                  {d.reasoning ? (
                    <Text style={styles.reasoningText}>{d.reasoning}</Text>
                  ) : null}
                  {!d.success && d.error ? (
                    <Text style={styles.errorMsg}>✗ {d.error}</Text>
                  ) : null}
                </View>
              ))}
              {record.account_state && (
                <View style={styles.accountState}>
                  <Text style={styles.accountStateLabel}>ACCOUNT AT DECISION TIME</Text>
                  <Text style={styles.accountStateLine}>
                    Balance ${record.account_state.available_balance?.toFixed(2)} · Margin {record.account_state.margin_used_pct?.toFixed(1)}% · {record.account_state.position_count} positions
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Chain of Thought tab */}
          {cotTab === 'cot' && hasCot && (
            <View style={styles.cotBlock}>
              <Text style={styles.cotLabel}>CHAIN OF THOUGHT</Text>
              <Text style={styles.cotText}>{record.cot_trace}</Text>
            </View>
          )}

          {/* Execution log tab */}
          {cotTab === 'log' && hasLog && (
            <View style={styles.logBlock}>
              <Text style={styles.logLabel}>EXECUTION LOG</Text>
              {record.execution_log.map((line, i) => (
                <Text key={i} style={[
                  styles.logLine,
                  line.includes('✓') || line.includes('success') ? { color: colors.green } :
                  line.includes('✗') || line.includes('error') || line.includes('fail') ? { color: colors.red } :
                  undefined,
                ]}>{line}</Text>
              ))}
            </View>
          )}

          {record.error_message ? (
            <Text style={styles.errorMsg}>{record.error_message}</Text>
          ) : null}
        </View>
      )}
    </Card>
  )
})

// ─── main screen ───────────────────────────────────────────────────────────
type TabType = 'orders' | 'decisions'

export function HistoryScreen() {
  const { selectedTraderId } = useTraderStore()
  const [activeTab, setActiveTab] = useState<TabType>('orders')
  const [orderLimit, setOrderLimit] = useState(PAGE_SIZE)
  const [decisionLimit, setDecisionLimit] = useState(PAGE_SIZE)
  const [symbolFilter, setSymbolFilter] = useState<string | undefined>()

  const {
    data: orders = [], isLoading: ordersLoading, mutate: refetchOrders,
  } = useOrders(selectedTraderId, orderLimit, symbolFilter)

  const {
    data: decisions = [], isLoading: decisionsLoading, mutate: refetchDecisions,
  } = useDecisionHistory(selectedTraderId, decisionLimit)

  const isLoading = activeTab === 'orders' ? ordersLoading : decisionsLoading

  const onRefresh = useCallback(() => {
    refetchOrders()
    refetchDecisions()
  }, [refetchOrders, refetchDecisions])

  // Unique symbols from orders for filter chips
  const symbols = useMemo(() => {
    const set = new Set(orders.map((o) => o.symbol))
    return Array.from(set).sort()
  }, [orders])

  // Export orders as CSV
  const handleExport = useCallback(async () => {
    if (orders.length === 0) { Alert.alert('No data', 'No orders to export'); return }
    const header = 'time,symbol,action,qty,avg_price,fee,status,exchange'
    const rows = orders.map((o) =>
      [
        fmtTime(o.filled_at || o.created_at),
        o.symbol,
        o.order_action,
        o.filled_quantity || o.quantity,
        o.avg_fill_price.toFixed(4),
        o.commission.toFixed(4),
        o.status,
        o.exchange_type,
      ].join(',')
    )
    await Share.share({ message: [header, ...rows].join('\n'), title: 'FTS Orders Export' })
  }, [orders])

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        // contentContainerStyle={styles.content}
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
      

        {/* Tab switcher */}
        <View style={styles.tabs}>
          <Tab label={`Orders (${orders.length})`}    active={activeTab === 'orders'}    onPress={() => setActiveTab('orders')} />
          <Tab label={`AI Decisions (${decisions.length})`} active={activeTab === 'decisions'} onPress={() => setActiveTab('decisions')} />
        </View>

        {/* Symbol filter (orders only) */}
        {activeTab === 'orders' && symbols.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterContent}
          >
            <TouchableOpacity
              style={[styles.pill, !symbolFilter && styles.pillActive]}
              onPress={() => setSymbolFilter(undefined)}
            >
              <Text style={[styles.pillText, !symbolFilter && styles.pillTextActive]}>All</Text>
            </TouchableOpacity>
            {symbols.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.pill, symbolFilter === s && styles.pillActive]}
                onPress={() => setSymbolFilter(symbolFilter === s ? undefined : s)}
              >
                <Text style={[styles.pillText, symbolFilter === s && styles.pillTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Content */}
        {!selectedTraderId ? (
          <Text style={styles.empty}>Select a trader from the Traders tab</Text>
        ) : isLoading && (activeTab === 'orders' ? orders : decisions).length === 0 ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : activeTab === 'orders' ? (
          <>
            {orders.length === 0
              ? <Text style={styles.empty}>No orders yet</Text>
              : orders.map((o) => <OrderCard key={o.id} order={o} />)
            }
            {orders.length >= orderLimit && (
              <TouchableOpacity
                style={styles.loadMore}
                onPress={() => setOrderLimit((n) => n + PAGE_SIZE)}
              >
                <Text style={styles.loadMoreText}>Load more</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {decisions.length === 0
              ? <Text style={styles.empty}>No AI decisions yet</Text>
              : decisions.map((d) => <DecisionCard key={d.id} record={d} />)
            }
            {decisions.length >= decisionLimit && (
              <TouchableOpacity
                style={styles.loadMore}
                onPress={() => setDecisionLimit((n) => n + PAGE_SIZE)}
              >
                <Text style={styles.loadMoreText}>Load more</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[4], paddingBottom: spacing[10] },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  title: { color: colors.gold, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace', letterSpacing: 1 },
  exportBtn: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  exportText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs },

  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radius.md, marginBottom: spacing[3], overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: spacing[3], alignItems: 'center' },
  tabActive: { backgroundColor: colors.goldDim },
  tabText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold, letterSpacing: 1 },
  tabTextActive: { color: colors.gold },

  filterRow: { marginBottom: spacing[3] },
  filterContent: { flexDirection: 'row', gap: spacing[2], paddingRight: spacing[2] },
  pill: { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.full, borderWidth: 1, borderColor: colors.panelBorder },
  pillActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  pillText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs },
  pillTextActive: { color: colors.gold },

  card: { marginBottom: spacing[3] },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[1] },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },

  symbol: { color: colors.textPrimary, fontSize: fontSize.md, fontFamily: 'monospace', fontWeight: '600' },
  leverage: { color: colors.gold, fontSize: fontSize.xs, fontFamily: 'monospace', fontWeight: fontWeight.bold, backgroundColor: colors.goldDim, paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: radius.sm },
  action: { fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: fontWeight.bold, letterSpacing: 1, marginBottom: spacing[2] },

  row: { flexDirection: 'row', marginBottom: spacing[2] },
  col: { flex: 1 },
  fieldLabel: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginBottom: 2 },
  fieldValue: { color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: '500' },

  timestamp: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginTop: spacing[1] },

  cycleLabel: { color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: '600' },
  duration: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs },
  expandIcon: { color: colors.textTertiary, fontSize: fontSize.xs },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[2] },
  actionChip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing[2], paddingVertical: 2 },
  actionChipText: { fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold },

  expandedContent: { marginTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing[3] },
  reasoningBlock: { marginBottom: spacing[3] },
  reasoningSymbol: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold, marginBottom: spacing[1] },
  reasoningText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs, lineHeight: 18 },
  logBlock: { marginTop: spacing[2] },
  logLabel: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, letterSpacing: 2, marginBottom: spacing[1] },
  logLine: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, lineHeight: 16 },
  errorMsg: { color: colors.red, fontFamily: 'monospace', fontSize: fontSize.xs, marginTop: spacing[2] },

  // CoT tabs
  cotTabs: { flexDirection: 'row', gap: spacing[1], marginBottom: spacing[3] },
  cotTab: { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.full, borderWidth: 1, borderColor: colors.panelBorder },
  cotTabActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  cotTabText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs },
  cotTabTextActive: { color: colors.gold, fontWeight: fontWeight.bold },
  cotBadge: { fontSize: 13 },

  // CoT content
  cotBlock: { backgroundColor: 'rgba(59,130,246,0.04)', borderRadius: radius.md, padding: spacing[3], borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)' },
  cotLabel: { color: colors.gold, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold, letterSpacing: 2, marginBottom: spacing[2] },
  cotText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs, lineHeight: 20 },

  // Decision details
  decisionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  confidenceBadge: { fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  slTpRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[1] },
  slTpText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs },
  slTpDivider: { color: colors.textDisabled, fontFamily: 'monospace', fontSize: fontSize.xs },

  // Account state snapshot
  accountState: { marginTop: spacing[3], paddingTop: spacing[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  accountStateLabel: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginBottom: 4 },
  accountStateLine: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs },

  loader: { marginTop: spacing[10] },
  empty: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing[10] },
  loadMore: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radius.md, padding: spacing[3], alignItems: 'center', marginTop: spacing[2] },
  loadMoreText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.sm },
})
