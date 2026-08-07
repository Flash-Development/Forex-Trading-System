import React from 'react'
import { NavigationContainer, DarkTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../stores'
import { TabNavigator } from './TabNavigator.tsx'
import { LoginScreen } from '../screens/Login/index.tsx'
import { SettingsScreen } from '../screens/Settings/index.tsx'
import { ExchangesScreen } from '../screens/Exchanges/index.tsx'
import { colors } from '../theme'
import { CompetitionScreen } from '@/screens/Competition/index.tsx'
import { StrategyScreen } from '@/screens/Strategy/index.tsx'

export type RootStackParamList = {
  Auth: undefined
  Main: undefined
  Settings: undefined
  Competition: undefined
  Strategy: undefined
  Exchanges: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

// Override the default DarkTheme background to match our design system
const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgLighter,
    border: 'transparent',
    primary: colors.gold,
    text: colors.textPrimary,
    notification: colors.gold,
  },
}

export function RootNavigator() {
  const { user } = useAuthStore()

  return (
    <NavigationContainer theme={AppTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // Fade between auth↔main to avoid the jarring slide-in flash
          animation: 'fade',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                headerShown: true,
                animation: 'slide_from_right',
                headerTitle: 'Settings',
                headerStyle: { backgroundColor: colors.bgLighter },
                headerTintColor: colors.gold,
                headerTitleStyle: { fontFamily: 'monospace', fontWeight: '700' },
              }}
            />
            <Stack.Screen
              name="Competition"
              component={CompetitionScreen}
              options={{
                headerShown: true,
                animation: 'slide_from_right',
                headerTitle: 'Competition',
                headerStyle: { backgroundColor: colors.bgLighter },
                headerTintColor: colors.gold,
                headerTitleStyle: { fontFamily: 'monospace', fontWeight: '700' },
              }}
            />

              <Stack.Screen
              name="Strategy"
              component={StrategyScreen}
              options={{
                headerShown: true,
                animation: 'slide_from_right',
                headerTitle: 'Strategy',
                headerStyle: { backgroundColor: colors.bgLighter },
                headerTintColor: colors.gold,
                headerTitleStyle: { fontFamily: 'monospace', fontWeight: '700' },
              }}
            />
            <Stack.Screen
              name="Exchanges"
              component={ExchangesScreen}
              options={{
                headerShown: true,
                animation: 'slide_from_right',
                headerTitle: 'Exchanges',
                headerStyle: { backgroundColor: colors.bgLighter },
                headerTintColor: colors.gold,
                headerTitleStyle: { fontFamily: 'monospace', fontWeight: '700' },
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Auth" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
