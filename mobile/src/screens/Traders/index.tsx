import React, { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, ScrollView, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTraders, useTraderStatus } from '../../hooks/useTraderData.ts'
import { useTraderStore, useAuthStore } from '../../stores'
import { traderApi } from '../../lib/api/traders.ts'
import { Card } from '../../components/ui/Card.tsx'
import { Badge } from '../../components/ui/Badge.tsx'
import { StatRow } from '../../components/ui/StatRow.tsx'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { TraderInfo } from '../../types'
import styles from './styles.ts'
import TraderCard from './_components/TradersCard.tsx'


// ─── main screen ───────────────────────────────────────────────────────────
export function TradersScreen() {
  const { token } = useAuthStore()
  const { selectedTraderId, setSelectedTrader } = useTraderStore()
  const { data: traders = [], isLoading, mutate } = useTraders(!!token)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleToggle = useCallback((trader: TraderInfo) => {
    const action = trader.is_running ? 'stop' : 'start'
    const label = trader.is_running ? 'Stop' : 'Start'

    Alert.alert(
      `${label} "${trader.trader_name}"?`,
      trader.is_running
        ? 'This will halt live trading immediately.'
        : 'This will begin autonomous live trading.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: label,
          style: trader.is_running ? 'destructive' : 'default',
          onPress: async () => {
            setTogglingId(trader.trader_id)
            try {
              if (action === 'start') await traderApi.startTrader(trader.trader_id)
              else await traderApi.stopTrader(trader.trader_id)
              // Optimistic update then revalidate
              mutate(
                traders.map((t) =>
                  t.trader_id === trader.trader_id
                    ? { ...t, is_running: !t.is_running }
                    : t
                ),
                false
              )
              // Revalidate after a short delay to get server truth
              setTimeout(() => mutate(), 1500)
            } catch (e: any) {
              Alert.alert(
                `Failed to ${action} trader`,
                e.message ?? 'An unexpected error occurred.',
                [{ text: 'OK' }]
              )
              mutate() // revert optimistic update
            } finally {
              setTogglingId(null)
            }
          },
        },
      ]
    )
  }, [traders, mutate])

  const runningCount = traders.filter((t) => t.is_running).length

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => mutate()}
            tintColor={colors.gold}
            colors={[colors.gold]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Live count pill */}
        {traders.length > 0 && (
          <View style={styles.header}>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                <Text style={{ color: runningCount > 0 ? colors.green : colors.textTertiary }}>{runningCount}</Text>
                <Text style={styles.summaryText}>/{traders.length} live</Text>
              </Text>
            </View>
          </View>
        )}

        {isLoading && traders.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : traders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No traders yet</Text>
            <Text style={styles.emptyHint}>
              Tap the + button below to create your first AI trader.
            </Text>
          </View>
        ) : (
        traders.map((trader) => (
            <TraderCard
              key={trader.trader_id}
              trader={trader}
              isSelected={trader.trader_id === selectedTraderId}
              onSelect={() => setSelectedTrader(trader.trader_id)}
              onToggle={() => { handleToggle(trader) }}
              toggling={togglingId === trader.trader_id}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

