import React from 'react'
import { View, StyleSheet, ViewStyle } from 'react-native'
import { colors, radius, spacing } from '../../theme'

interface CardProps {
  children: React.ReactNode
  style?: ViewStyle
  gold?: boolean
}

export const Card = React.memo(function Card({ children, style, gold }: CardProps) {
  return (
    <View style={[styles.card, gold && styles.cardGold, style]}>
      {gold && <View style={styles.topAccent} />}
      <View style={gold ? styles.innerGold : styles.inner}>
        {children}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panelBg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardGold: {
    borderColor: colors.panelBorderHover,
  },
  topAccent: {
    height: 2,
    backgroundColor: colors.gold,
  },
  inner: {
    padding: spacing[4],
  },
  innerGold: {
    padding: spacing[4],
  },
})
