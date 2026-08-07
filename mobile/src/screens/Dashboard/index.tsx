import React, { useCallback } from 'react'
import {
  View, Text, RefreshControl,
  ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  useAccount, usePositions, useTraderStatus,
  useStatistics, useEquityHistory,
} from '../../hooks/useTraderData.ts'
import { useTraderStore } from '../../stores'
import { useSettingsStore } from '../../stores/settingsStore'
import { StatRow } from '../../components/ui/StatRow.tsx'
import { EquityChart } from '../../components/charts/EquityChart.tsx'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import styles from './styles.ts'
import HeroCard from './_components/HeroCard.tsx'
import { fmt } from './constant.ts'
import StatCard from './_components/StatCard.tsx'
import SectionHeader from './_components/SectionHeader.tsx'
import PositionRow from './_components/PositionRow.tsx'

const paperBannerStyle = {
  backgroundColor: 'rgba(245,158,11,0.12)',
  borderWidth: 1,
  borderColor: 'rgba(245,158,11,0.35)',
  borderRadius: radius.md,
  paddingHorizontal: spacing[3],
  paddingVertical: spacing[2],
  marginBottom: spacing[3],
  alignItems: 'center' as const,
}

const paperBannerText = {
  color: colors.warning,
  fontFamily: 'monospace',
  fontSize: fontSize.xs,
  fontWeight: fontWeight.bold,
  letterSpacing: 0.5,
}


// ─── main screen ─────────────────────────────────────────────────────────────
export function DashboardScreen() {
  const { selectedTraderId } = useTraderStore()
  const { paperMode } = useSettingsStore()
  const { data: status, mutate: refetchStatus } = useTraderStatus(selectedTraderId)
  const { data: account, isLoading: accountLoading, mutate: refetchAccount } = useAccount(selectedTraderId)
  const { data: positions = [], isLoading: posLoading, mutate: refetchPositions } = usePositions(selectedTraderId)
  const { data: stats, mutate: refetchStats } = useStatistics(selectedTraderId)
  const { data: equityHistory = [], mutate: refetchEquity } = useEquityHistory(selectedTraderId)

  const isLoading = accountLoading || posLoading

  const onRefresh = useCallback(() => {
    refetchStatus(); refetchAccount(); refetchPositions(); refetchStats(); refetchEquity()
  }, [])

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />}
        showsVerticalScrollIndicator={false}
      >
        {!selectedTraderId ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No trader selected</Text>
            <Text style={styles.emptyHint}>Tap the + button to create a trader, or select one from the Traders tab.</Text>
          </View>
        ) : isLoading && !account ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : account ? (
          <>
            {/* Paper mode banner */}
            {paperMode && (
              <View style={paperBannerStyle}>
                <Text style={paperBannerText}>📄  PAPER TRADING — no real orders are executed</Text>
              </View>
            )}

            {/* Hero balance card */}
            <HeroCard
              equity={account.total_equity}
              pnl={account.total_pnl}
              pnlPct={account.total_pnl_pct}
              dailyPnl={account.daily_pnl}
              isRunning={status?.is_running ?? false}
              traderName={status?.trader_name}
            />

            {/* Equity chart */}
            <StatCard>
              <View style={styles.chartHeader}>
                <Text style={styles.sectionLabel}>EQUITY CURVE</Text>
              </View>
              <EquityChart data={equityHistory} initialBalance={account.initial_balance} />
            </StatCard>

            {/* Summary grid */}
            <SectionHeader title="Summary" />
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Wallet</Text>
                <Text style={styles.summaryValue}>${fmt(account.wallet_balance)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Available</Text>
                <Text style={styles.summaryValue}>${fmt(account.available_balance)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Margin</Text>
                <Text style={[styles.summaryValue, { color: account.margin_used_pct > 80 ? colors.red : colors.textPrimary }]}>
                  {fmt(account.margin_used_pct, 1)}%
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Positions</Text>
                <Text style={styles.summaryValue}>{account.position_count}</Text>
              </View>
            </View>

            {/* Statistics */}
            {stats && (
              <>
                <SectionHeader title="Statistics" />
                <StatCard>
                  <StatRow label="Total Trades" value={String(stats.total_trades||0)} />
                  <StatRow label="Win Rate" value={`${fmt(stats.win_rate, 1)}%`} valueColor={stats.win_rate >= 50 ? colors.green : colors.red} />
                  <StatRow label="Win / Loss" value={`${stats.win_trades||0} / ${stats.loss_trades||0}`} />
                  {stats.profit_factor > 0 && <StatRow label="Profit Factor" value={fmt(stats.profit_factor)} />}
                  {stats.max_drawdown_pct > 0 && <StatRow label="Max Drawdown" value={`${fmt(stats.max_drawdown_pct, 1)}%`} valueColor={colors.red} />}
                  <StatRow label="Total Fees" value={`$${fmt(stats.total_fee)}`} />
                </StatCard>
              </>
            )}

            {/* Trader status */}
            {status && (
              <>
                <SectionHeader title="Trader" />
                <StatCard>
                  <StatRow label="AI Model" value={status.ai_model} />
                  <StatRow label="Provider" value={status.ai_provider} />
                  <StatRow label="Strategy" value={status.strategy_type === 'grid_trading' ? 'Grid' : 'AI Trading'} />
                  <StatRow label="Interval" value={status.scan_interval} />
                  <StatRow label="Cycles" value={String(status.call_count)} />
                  <StatRow label="Runtime" value={`${status.runtime_minutes}m`} />
                </StatCard>
              </>
            )}

            {/* Open positions */}
            {positions?.length > 0 && (
              <>
                <SectionHeader title="Open Positions" count={positions.length} />
                <StatCard>
                  {positions.map((pos, i) => (
                    <PositionRow key={`${pos.symbol}-${i}`} pos={pos} />
                  ))}
                </StatCard>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}




