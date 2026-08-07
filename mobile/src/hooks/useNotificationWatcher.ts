/**
 * Watches SWR data for changes and fires local notifications.
 * Mount this once at the app root level.
 */
import { useEffect, useRef } from 'react'
import { useOrders, useDecisionHistory, useAccount } from './useTraderData.ts'
import { useTraderStore } from '../stores'
import { notificationService } from '../lib/notifications.ts'
import type { TraderOrder } from '../types/history'

export function useNotificationWatcher() {
  const { selectedTraderId, traders } = useTraderStore()
  const traderName = traders.find((t) => t.trader_id === selectedTraderId)?.trader_name ?? 'Trader'

  const { data: orders = [] } = useOrders(selectedTraderId, 20)
  const { data: decisions = [] } = useDecisionHistory(selectedTraderId, 5)
  const { data: account } = useAccount(selectedTraderId)

  // Track seen IDs to avoid re-notifying on revalidation
  const seenOrders = useRef<Set<number>>(new Set())
  const seenDecisions = useRef<Set<number>>(new Set())
  const riskAlerted = useRef(false)

  // New FILLED orders
  useEffect(() => {
    orders.forEach((order: TraderOrder) => {
      if (order.status !== 'FILLED') return
      if (seenOrders.current.has(order.id)) return
      seenOrders.current.add(order.id)
      // Only notify for orders filled in the last 2 minutes
      const age = Date.now() - (order.filled_at || order.created_at)
      if (age > 2 * 60 * 1000) return
      notificationService.notifyTradeExecuted(
        order.symbol,
        order.order_action,
        order.avg_fill_price || order.price
      )
    })
  }, [orders])

  // New AI decision cycles
  useEffect(() => {
    decisions.forEach((d) => {
      if (seenDecisions.current.has(d.id)) return
      seenDecisions.current.add(d.id)
      // Only notify for decisions in the last 5 minutes
      const age = Date.now() - new Date(d.timestamp).getTime()
      if (age > 5 * 60 * 1000) return
      if (d.decisions?.length > 0) {
        notificationService.notifyAIDecision(traderName, d.cycle_number, d.decisions.length)
      }
    })
  }, [decisions, traderName])

  // Risk alert: margin > 85%
  useEffect(() => {
    if (!account) return
    if (account.margin_used_pct > 85 && !riskAlerted.current) {
      riskAlerted.current = true
      notificationService.notifyRiskAlert(
        traderName,
        `Margin usage at ${account.margin_used_pct.toFixed(1)}%`
      )
    } else if (account.margin_used_pct <= 80) {
      riskAlerted.current = false // reset so it can alert again
    }
  }, [account, traderName])
}
