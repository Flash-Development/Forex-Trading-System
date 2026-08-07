import React, { memo } from 'react'
import { colors, fontSize, fontWeight, radius, spacing } from "@/theme";
import { StyleSheet, Text, View } from "react-native";
import { fmt, fmtPct } from "../constant";

const PositionRow = memo(function PositionRow({ pos }: { pos: any }) {
  const isLong = pos.side.toLowerCase() === 'long'
  const pnlColor = pos.unrealized_pnl >= 0 ? colors.green : colors.red
  const pnlPositive = pos.unrealized_pnl >= 0

  return (
    <View style={pr.row}>
      <View style={pr.left}>
        <View style={[pr.sidePill, { backgroundColor: isLong ? colors.greenBg : colors.redBg, borderColor: isLong ? colors.greenBorder : colors.redBorder }]}>
          <Text style={[pr.sideText, { color: isLong ? colors.green : colors.red }]}>
            {isLong ? 'L' : 'S'}
          </Text>
        </View>
        <View>
          <Text style={pr.symbol}>{pos.symbol}</Text>
          <Text style={pr.meta}>{pos.leverage}x leverage</Text>
        </View>
      </View>
      <View style={pr.right}>
        <Text style={[pr.pnl, { color: pnlColor }]}>
          {pnlPositive ? '+' : ''}${fmt(pos.unrealized_pnl)}
        </Text>
        <Text style={[pr.pct, { color: pnlColor }]}>{fmtPct(pos.unrealized_pnl_pct)}</Text>
      </View>
    </View>
  )
})

export default PositionRow;

const pr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.panelBorder,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  sidePill: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideText: {
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
  },
  symbol: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  right: { alignItems: 'flex-end' },
  pnl: {
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  pct: {
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    marginTop: 2,
    opacity: 0.8,
  },
})
