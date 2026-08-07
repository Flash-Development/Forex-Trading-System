import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrandLogo } from './BrandLogo'
import { Icon } from './ui/Icon'
import { Badge } from './ui/Badge'
import { colors, fontSize, fontWeight, spacing } from '../theme'

interface Props {
  screenName: string
  isRunning?: boolean
  onMenuPress: () => void
}

const SCREEN_LABELS: Record<string, string> = {
  Dashboard: 'Dashboard',
  Traders:   'Traders',
  Positions: 'Positions',
  History:   'History',
  Analytics: 'Analytics',
}

export function AppHeader({ screenName, isRunning, onMenuPress }: Props) {
  const insets = useSafeAreaInsets()
  const label = SCREEN_LABELS[screenName] ?? screenName

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing[2] }]}>
      <BrandLogo size={28} />
      <Text style={styles.title}>{label}</Text>
      <View style={styles.right}>
        {isRunning !== undefined && (
          <Badge
            label={isRunning ? 'LIVE' : 'OFF'}
            variant={isRunning ? 'success' : 'muted'}
          />
        )}
        <TouchableOpacity onPress={onMenuPress} style={styles.menuBtn} activeOpacity={0.7}>
          <Icon name="menu" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.glassBorder,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  menuBtn: {
    padding: spacing[1],
  },
})
