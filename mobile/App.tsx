import React, { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View, StyleSheet } from 'react-native'
import './global.css'
import { validateEnv } from './src/lib/env'
import { initSentry } from './src/lib/sentry'
import { CryptoService } from './src/lib/crypto'
import { useAuthStore, useTraderStore } from './src/stores'
import { useSettingsStore } from './src/stores/settingsStore'
import { RootNavigator } from './src/navigation/index.tsx'
import { SWRProvider } from './src/lib/swrConfig.tsx'
import { BiometricGuard } from './src/components/BiometricGuard'
import { SplashScreen } from './src/components/SplashScreen'
import { useNotificationWatcher } from './src/hooks/useNotificationWatcher.ts'
import { colors } from './src/theme'

// Lazily resolve Sentry.wrap — graceful no-op if package not yet installed
let SentryWrap: (<T>(component: T) => T) | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SentryWrap = require('@sentry/react-native').wrap
} catch {
  // @sentry/react-native not installed — wrap is a no-op
}

// Requirement 1.1: validate env at startup before any other logic
validateEnv()

// Requirement 5.1: initialise Sentry immediately after env validation
initSentry()

// Suppress expo-notifications Expo Go warnings — these are expected in Expo Go
// and do not affect local notification functionality.
if (__DEV__) {
  const SUPPRESSED = [
    'expo-notifications: Android Push notifications',
    'expo-notifications` functionality is not fully supported in Expo Go',
  ]
  const _error = console.error.bind(console)
  const _warn = console.warn.bind(console)
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && SUPPRESSED.some((s) => args[0].includes(s))) return
    _error(...args)
  }
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && SUPPRESSED.some((s) => args[0].includes(s))) return
    _warn(...args)
  }
}

function AppInner() {
  useNotificationWatcher()
  return <RootNavigator />
}

function App() {
  const { hydrate, isHydrated } = useAuthStore()
  const { hydrate: hydrateTrader, fetchTraders } = useTraderStore()
  const { hydrate: hydrateSettings } = useSettingsStore()
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    // Hydrate auth + trader selection in parallel, then fetch traders so
    // the dashboard has a selectedTraderId before it first renders.
    Promise.all([hydrate(), hydrateTrader(), hydrateSettings()]).then(([]) => {
      CryptoService.fetchCryptoConfig()
      // Only fetch traders if the user is already logged in
      if (useAuthStore.getState().user) fetchTraders()
    })
  }, [])

  // Show animated splash until both hydration is done and animation finishes
  if (showSplash || !isHydrated) {
    return (
      <SplashScreen
        onFinish={() => {
          if (isHydrated) setShowSplash(false)
          else {
            // Poll until hydrated then dismiss
            const check = setInterval(() => {
              if (useAuthStore.getState().isHydrated) {
                clearInterval(check)
                setShowSplash(false)
              }
            }, 100)
          }
        }}
      />
    )
  }

  return (
    <SafeAreaProvider>
      <SWRProvider>
        {/* Requirement 3.1: wrap protected content with BiometricGuard */}
        <BiometricGuard>
          <StatusBar style="light" backgroundColor="#000000" />
          <AppInner />
        </BiometricGuard>
      </SWRProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#000000',
  },
})

// Requirement 5.7: wrap root component with Sentry.wrap to capture React render errors
export default SentryWrap ? SentryWrap(App) : App
