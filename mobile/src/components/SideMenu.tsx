import React, { useEffect, useRef } from 'react'
import {
  Animated, Dimensions, Modal, Pressable,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/index'
import { colors, fontSize, fontWeight, radius, spacing } from '../theme'
import { Icon } from './ui/Icon'
import { BrandLogo } from './BrandLogo'

const { width: W } = Dimensions.get('window')
const MENU_WIDTH = W * 0.72

interface MenuItem {
  label: string
  sublabel: string
  icon: string
  action: () => void
  accent?: string
}

interface Props {
  visible: boolean
  onClose: () => void
  onNewTrader: () => void
}

export function SideMenu({ visible, onClose, onNewTrader }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const insets = useSafeAreaInsets()
  const translateX = useRef(new Animated.Value(-MENU_WIDTH)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 20, tension: 180 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -MENU_WIDTH, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  const navigate = (screen: keyof RootStackParamList) => {
    onClose()
    setTimeout(() => nav.navigate(screen as any), 250)
  }

  const items: MenuItem[] = [
    {
      label: 'New Trader',
      sublabel: 'Create an AI trading bot',
      icon: 'plus',
      accent: colors.gold,
      action: () => { onClose(); setTimeout(onNewTrader, 250) },
    },
    {
      label: 'Exchanges',
      sublabel: 'Manage API connections',
      icon: 'exchange',
      action: () => navigate('Exchanges'),
    },
    {
      label: 'Strategy',
      sublabel: 'Configure trading strategy',
      icon: 'strategy',
      action: () => navigate('Strategy'),
    },
    {
      label: 'Competition',
      sublabel: 'Leaderboard & rankings',
      icon: 'competition',
      action: () => navigate('Competition'),
    },
    {
      label: 'Settings',
      sublabel: 'Account & preferences',
      icon: 'settings',
      action: () => navigate('Settings'),
    },
  ]

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }], paddingTop: insets.top + spacing[4] }]}>
        {/* Brand */}
        <View style={styles.brand}>
          <BrandLogo size={32} />
          <View>
            <Text style={styles.brandName}>FTS</Text>
            <Text style={styles.brandSub}>Flash Trading System</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Menu items */}
        <View style={styles.items}>
          {items.map((item) => (
            <TouchableOpacity key={item.label} style={styles.item} onPress={item.action} activeOpacity={0.7}>
              <View style={[styles.iconWrap, item.accent ? { backgroundColor: item.accent + '22', borderColor: item.accent + '44' } : styles.iconWrapDefault]}>
                <Icon name={item.icon} size={18} color={item.accent ?? colors.textSecondary} />
              </View>
              <View style={styles.itemText}>
                <Text style={[styles.itemLabel, item.accent ? { color: item.accent } : null]}>{item.label}</Text>
                <Text style={styles.itemSub}>{item.sublabel}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bottom close hint */}
        <TouchableOpacity style={[styles.closeBtn, { marginBottom: insets.bottom + spacing[4] }]} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.closeBtnText}>✕  CLOSE</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: MENU_WIDTH,
    backgroundColor: colors.bgSecondary,
    borderRightWidth: 1,
    borderRightColor: colors.glassBorder,
    paddingHorizontal: spacing[5],
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[5],
  },
  brandName: {
    color: colors.gold,
    fontFamily: 'monospace',
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 4,
  },
  brandSub: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.glassBorder,
    marginBottom: spacing[5],
  },
  items: {
    flex: 1,
    gap: spacing[1],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderRadius: radius.lg,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDefault: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: colors.glassBorder,
  },
  itemText: { flex: 1 },
  itemLabel: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  itemSub: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  chevron: {
    color: colors.textTertiary,
    fontSize: 20,
    lineHeight: 22,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    marginTop: spacing[4],
  },
  closeBtnText: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
  },
})
