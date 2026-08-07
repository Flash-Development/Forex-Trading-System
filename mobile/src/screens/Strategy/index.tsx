import React, { useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import useSWR from 'swr'
import { API_BASE } from '../../lib/httpClient'
import { Card } from '../../components/ui/Card'
import { StatRow } from '../../components/ui/StatRow'
import { Badge } from '../../components/ui/Badge'
import { colors, fontSize, fontWeight, spacing } from '../../theme'

interface RiskControl {
  min_risk_reward_ratio?: number
  min_confidence?: number
  max_positions?: number
  btceth_max_leverage?: number
  altcoin_max_leverage?: number
  risk_pct_per_trade?: number
  max_daily_loss_pct?: number
  allowed_sessions?: string[]
}

interface Strategy {
  id: string
  name: string
  description: string
  is_active: boolean
  config: {
    strategy_type?: string
    ai_config?: {
      risk_control?: RiskControl
      coin_source?: { source_type?: string; forex_pairs?: string[] }
    }
    grid_config?: { symbol?: string; grid_count?: number; leverage?: number }
  }
}

function pct(val: number) {
  return (val * 100).toFixed(val < 0.01 ? 2 : 1) + '%'
}

export function StrategyScreen() {
  const { data: strategies = [], isLoading, mutate } = useSWR<Strategy[]>(
    `${API_BASE}/strategies`,
    { refreshInterval: 0 }
  )

  const active = strategies.find((s) => s.is_active) ?? strategies[0]
  const isForex = active?.config?.ai_config?.coin_source?.source_type === 'forex'
  const isGrid = active?.config?.strategy_type === 'grid_trading'
  const rc = active?.config?.ai_config?.risk_control
  const gc = active?.config?.grid_config
  const pairs = active?.config?.ai_config?.coin_source?.forex_pairs

  const onRefresh = useCallback(() => mutate(), [mutate])

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading && strategies.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : !active ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>No strategy configured</Text>
            <Text style={styles.emptyHint}>Create and activate a strategy in the web dashboard.</Text>
          </Card>
        ) : (
          <>
            {/* All strategies chips */}
            <Text style={styles.sectionLabel}>ALL STRATEGIES ({strategies.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipContent}>
              {strategies.map((s) => (
                <View key={s.id} style={[styles.chip, s.is_active && styles.chipActive]}>
                  <Text style={[styles.chipText, s.is_active && styles.chipTextActive]} numberOfLines={1}>{s.name}</Text>
                  {s.is_active && <Text style={styles.chipDot}> ●</Text>}
                </View>
              ))}
            </ScrollView>

            {/* Active strategy card */}
            <Text style={styles.sectionLabel}>ACTIVE STRATEGY</Text>
            <Card gold>
              <View style={styles.stratHeader}>
                <View style={styles.stratInfo}>
                  <Text style={styles.stratName}>{active.name}</Text>
                  {!!active.description && (
                    <Text style={styles.stratDesc} numberOfLines={3}>{active.description}</Text>
                  )}
                </View>
                <Badge
                  label={isGrid ? 'Grid' : isForex ? 'Forex' : 'AI'}
                  variant="gold"
                />
              </View>
            </Card>

            {/* Risk control */}
            {!!rc && (
              <>
                <Text style={styles.sectionLabel}>RISK CONTROL</Text>
                <Card>
                  {rc.max_positions != null && (
                    <StatRow label="Max Positions" value={String(rc.max_positions)} />
                  )}
                  {rc.min_risk_reward_ratio != null && (
                    <StatRow label="Min R:R" value={rc.min_risk_reward_ratio + ':1'} />
                  )}
                  {rc.min_confidence != null && (
                    <StatRow label="Min Confidence" value={rc.min_confidence + '%'} />
                  )}
                  {!!rc.risk_pct_per_trade && rc.risk_pct_per_trade > 0 && (
                    <StatRow label="Risk / Trade" value={pct(rc.risk_pct_per_trade)} />
                  )}
                  {!!rc.max_daily_loss_pct && rc.max_daily_loss_pct > 0 && (
                    <StatRow label="Daily DD Cap" value={pct(rc.max_daily_loss_pct)} valueColor={colors.red} />
                  )}
                  {rc.btceth_max_leverage != null && (
                    <StatRow
                      label={isForex ? 'Major Leverage' : 'BTC/ETH Leverage'}
                      value={rc.btceth_max_leverage + 'x'}
                    />
                  )}
                  {rc.altcoin_max_leverage != null && !isForex && (
                    <StatRow label="Altcoin Leverage" value={rc.altcoin_max_leverage + 'x'} />
                  )}
                  {!!rc.allowed_sessions && rc.allowed_sessions.length > 0 && (
                    <StatRow label="Sessions" value={rc.allowed_sessions.join(', ')} />
                  )}
                </Card>
              </>
            )}

            {/* Forex pairs */}
            {isForex && !!pairs && pairs.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>FOREX PAIRS ({pairs.length})</Text>
                <Card>
                  <View style={styles.pairsGrid}>
                    {pairs.map((p) => (
                      <View key={p} style={styles.pairChip}>
                        <Text style={styles.pairText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </>
            )}

            {/* Grid config */}
            {isGrid && !!gc && (
              <>
                <Text style={styles.sectionLabel}>GRID CONFIG</Text>
                <Card>
                  <StatRow label="Symbol" value={gc.symbol ?? '—'} />
                  <StatRow label="Grid Count" value={String(gc.grid_count ?? '—')} />
                  <StatRow label="Leverage" value={(gc.leverage ?? 1) + 'x'} />
                </Card>
              </>
            )}
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
  emptyCard: { alignItems: 'center', paddingVertical: spacing[8] },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing[2],
  },
  emptyHint: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    marginBottom: spacing[2],
    marginTop: spacing[4],
  },
  chipRow: { marginBottom: spacing[2] },
  chipContent: { flexDirection: 'row', gap: spacing[2], paddingRight: spacing[2] },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  chipText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs },
  chipTextActive: { color: colors.gold, fontWeight: fontWeight.semibold },
  chipDot: { color: colors.green, fontSize: 8 },
  stratHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  stratInfo: { flex: 1 },
  stratName: {
    color: colors.gold,
    fontFamily: 'monospace',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginBottom: 4,
  },
  stratDesc: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  pairsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pairChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(59,130,246,0.06)',
  },
  pairText: { color: colors.gold, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
})
