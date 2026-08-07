import { colors, fontSize, fontWeight, radius, spacing } from "@/theme";
import { StyleSheet, Text, View } from "react-native";
import { fmt, fmtPct } from "../constant";

function HeroCard({
  equity, pnl, pnlPct, dailyPnl, isRunning, traderName,
}: {
  equity: number; pnl: number; pnlPct: number
  dailyPnl: number; isRunning: boolean; traderName?: string
}) {
  const pnlPositive = pnl >= 0
  const dailyPositive = dailyPnl >= 0

  return (
    <View style={hero.card}>
      {/* Top accent strip */}
      <View style={[hero.accentStrip, { backgroundColor: isRunning ? colors.green : colors.textDisabled }]} />

      <View style={hero.inner}>
        {/* Top row */}
        <View style={hero.topRow}>
          <View style={hero.topLeft}>
            <Text style={hero.label}>TOTAL EQUITY</Text>
            {traderName && <Text style={hero.traderName}>{traderName}</Text>}
          </View>
          <View style={[hero.statusPill, { borderColor: isRunning ? colors.green : colors.textDisabled }]}>
            <View style={[hero.statusDot, { backgroundColor: isRunning ? colors.green : colors.textDisabled }]} />
            <Text style={[hero.statusText, { color: isRunning ? colors.green : colors.textDisabled }]}>
              {isRunning ? 'LIVE' : 'OFF'}
            </Text>
          </View>
        </View>

        {/* Balance */}
        <Text style={hero.balance}>${fmt(equity)}</Text>

        {/* Divider */}
        <View style={hero.divider} />

        {/* PnL row */}
        <View style={hero.pnlRow}>
          <View style={hero.pnlItem}>
            <Text style={hero.pnlLabel}>TOTAL P&L</Text>
            <Text style={[hero.pnlValue, { color: pnlPositive ? colors.green : colors.red }]}>
              {pnlPositive ? '+' : ''}{fmtPct(pnlPct)}
            </Text>
          </View>
          <View style={hero.pnlDivider} />
          <View style={hero.pnlItem}>
            <Text style={hero.pnlLabel}>TODAY</Text>
            <Text style={[hero.pnlValue, { color: dailyPositive ? colors.green : colors.red }]}>
              {dailyPositive ? '+' : ''}${fmt(Math.abs(dailyPnl))}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

export default HeroCard

const hero = StyleSheet.create({
  card: {
    backgroundColor: colors.panelBg,
    borderRadius: radius.xl,
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.panelBorder,
    overflow: 'hidden',
  },
  accentStrip: {
    height: 3,
    width: '100%',
  },
  inner: {
    padding: spacing[5],
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  topLeft: {},
  label: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: fontWeight.bold,
  },
  traderName: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    marginTop: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  balance: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: fontWeight.extrabold,
    fontFamily: 'monospace',
    letterSpacing: -1,
    marginBottom: spacing[4],
  },
  divider: {
    height: 1,
    backgroundColor: colors.panelBorder,
    marginBottom: spacing[3],
  },
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pnlItem: {
    flex: 1,
  },
  pnlDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.panelBorder,
    marginHorizontal: spacing[4],
  },
  pnlLabel: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: fontWeight.bold,
    marginBottom: 4,
  },
  pnlValue: {
    fontFamily: 'monospace',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
})
