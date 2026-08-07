// Trader颜色配置 - 统一的颜色分配逻辑
// 用于 ComparisonChart 和 Leaderboard，确保颜色一致性

export const TRADER_COLORS = [
  'var(--color-primary-3)', // blue-400
  'var(--color-purple-2)', // purple-400
  'var(--color-indicator-oi)', // emerald-400
  'var(--color-series-4)', // orange-400
  'var(--color-series-5)', // pink-400
  'var(--color-indicator-fr)', // amber-400
  'var(--color-sky-400)', // sky-400
  'var(--color-primary-3)', // violet-400
  'var(--color-series-7)', // green-400
  'var(--color-series-8)', // rose-400
]

/**
 * 根据trader的索引位置获取颜色
 * @param traders - trader列表
 * @param traderId - 当前trader的ID
 * @returns 对应的颜色值
 */
export function getTraderColor(
  traders: Array<{ trader_id: string }>,
  traderId: string
): string {
  const traderIndex = traders.findIndex((t) => t.trader_id === traderId)
  if (traderIndex === -1) return TRADER_COLORS[0] // 默认返回第一个颜色
  // 如果超出颜色池大小，循环使用
  return TRADER_COLORS[traderIndex % TRADER_COLORS.length]
}
