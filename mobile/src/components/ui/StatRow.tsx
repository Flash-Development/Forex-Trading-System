import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, fontSize, spacing } from '../../theme'

interface StatRowProps {
  label: string
  value: string
  valueColor?: string
}

export const StatRow = React.memo(function StatRow({ label, value, valueColor }: StatRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.panelBorder,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  value: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
})
