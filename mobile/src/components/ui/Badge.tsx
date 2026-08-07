import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { colors, fontSize, radius, spacing } from '../../theme'

type Variant = 'success' | 'danger' | 'gold' | 'muted'

interface BadgeProps {
  label: string
  variant?: Variant
  style?: ViewStyle
}

const variantStyles: Record<Variant, { bg: string; text: string; border: string }> = {
  success: { bg: colors.greenBg,  text: colors.green,         border: colors.greenBorder },
  danger:  { bg: colors.redBg,    text: colors.red,           border: colors.redBorder },
  gold:    { bg: colors.goldDim,  text: colors.gold,          border: colors.goldGlow },
  muted:   { bg: 'rgba(255,255,255,0.05)', text: colors.textSecondary, border: colors.glassBorder },
}

export function Badge({ label, variant = 'muted', style }: BadgeProps) {
  const v = variantStyles[variant]
  return (
    <View style={[styles.badge, { backgroundColor: v.bg, borderColor: v.border }, style]}>
      <Text style={[styles.text, { color: v.text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
})
