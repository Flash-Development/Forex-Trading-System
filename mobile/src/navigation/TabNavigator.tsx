import React, { useState } from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, radius } from '../theme'
import { AnimatedBackground } from '../components/AnimatedBackground'
import { AppHeader } from '../components/AppHeader'
import { SideMenu } from '../components/SideMenu'
import { CreateTraderWizard } from '../components/CreateTraderWizard'
import { DashboardScreen } from '../screens/Dashboard/index'
import { TradersScreen } from '../screens/Traders/index'
import { PositionsScreen } from '../screens/Positions/index'
import { HistoryScreen } from '../screens/History/index'
import { AnalyticsScreen } from '../screens/Analytics/index'
import { Icon } from '../components/ui/Icon'
import { useTraderStatus } from '../hooks/useTraderData'
import { useTraderStore } from '../stores'

export type TabParamList = {
  Dashboard: undefined
  Traders:   undefined
  Positions: undefined
  History:   undefined
  Analytics: undefined
}

const Tab = createBottomTabNavigator<TabParamList>()

const TAB_ICONS: Record<string, string> = {
  Dashboard: 'home',
  Traders:   'traders',
  Positions: 'positions',
  History:   'history',
  Analytics: 'chart',
}

let _openMenu: (() => void) | null = null
export function openSideMenu() { _openMenu?.() }

// ─── custom tab bar ──────────────────────────────────────────────────────────
function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets()

  const renderTab = (route: any) => {
    const isFocused = state.index === state.routes.indexOf(route)
    const iconName = TAB_ICONS[route.name] ?? 'home'

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
      if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name)
    }

    return (
      <TouchableOpacity key={route.key} style={styles.tabBtn} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.tabPill, isFocused && styles.tabPillActive]}>
          <Icon name={iconName} size={18} color={isFocused ? colors.bg : colors.textTertiary} />
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
      <View style={styles.bar}>
        {state.routes.map(renderTab)}
      </View>
    </View>
  )
}

// ─── inner navigator — has access to tab state via screenListeners ────────────
// Thin wrapper rendered by tabBar — calls onRouteChange in an effect so it
// never triggers setState during a parent render cycle.
function TabBarWithSync({
  props,
  onRouteChange,
}: {
  props: any
  onRouteChange: (name: string) => void
}) {
  const active = props.state.routes[props.state.index]?.name ?? 'Dashboard'
  React.useEffect(() => { onRouteChange(active) }, [active])
  return <CustomTabBar {...props} />
}

function InnerNavigator({ onRouteChange }: { onRouteChange: (name: string) => void }) {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBarWithSync props={props} onRouteChange={onRouteChange} />}
      screenOptions={{ lazy: true, headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Traders"   component={TradersScreen} />
      <Tab.Screen name="Positions" component={PositionsScreen} />
      <Tab.Screen name="History"   component={HistoryScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
    </Tab.Navigator>
  )
}

// ─── navigator ───────────────────────────────────────────────────────────────
// Separate component so the status poll re-renders only the header, not the navigator
function HeaderWithStatus({ activeRoute, onMenuPress }: { activeRoute: string; onMenuPress: () => void }) {
  const { selectedTraderId } = useTraderStore()
  const { data: status } = useTraderStatus(selectedTraderId)
  return (
    <AppHeader
      screenName={activeRoute}
      isRunning={status?.is_running}
      onMenuPress={onMenuPress}
    />
  )
}

export function TabNavigator() {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [activeRoute, setActiveRoute] = useState('Dashboard')

  _openMenu = () => setMenuOpen(true)

  return (
    <View style={{ flex: 1 }}>
      <AnimatedBackground />

      <HeaderWithStatus activeRoute={activeRoute} onMenuPress={() => setMenuOpen(true)} />

      <InnerNavigator onRouteChange={setActiveRoute} />

      <SideMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNewTrader={() => setWizardOpen(true)}
      />
      <CreateTraderWizard
        visible={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => setWizardOpen(false)}
      />
    </View>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  barWrap: {
    backgroundColor: colors.bg,
    paddingTop: spacing[2],
    paddingHorizontal: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgLighter,
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
  },
  tabPill: {
    width: 44,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillActive: {
    backgroundColor: colors.gold,
  },
})
