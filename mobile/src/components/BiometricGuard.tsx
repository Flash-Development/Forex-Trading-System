import React, { useEffect, useRef, useState } from 'react'
import {
  AppState,
  AppStateStatus,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { useAuthStore } from '../stores/authStore'
import { secureStorage, STORAGE_KEYS } from '../lib/secureStorage'
import { colors, fontSize, fontWeight, spacing } from '../theme'

interface Props {
  children: React.ReactNode
}

/**
 * BiometricGuard wraps protected content and prompts for biometric
 * authentication whenever the app returns from background/inactive state
 * while the user is authenticated AND has biometric unlock enabled.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */
export function BiometricGuard({ children }: Props) {
  const [locked, setLocked] = useState(false)
  const [supported, setSupported] = useState(false)
  const [enrolled, setEnrolled] = useState(false)
  const [unlockEnabled, setUnlockEnabled] = useState(false)
  const appState = useRef<AppStateStatus>(AppState.currentState)
  const { token } = useAuthStore()

  // Check biometric capability and user preference on mount
  useEffect(() => {
    async function checkBiometrics() {
      const [hasHardware, isEnrolled, pref] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        secureStorage.get(STORAGE_KEYS.BIOMETRIC_ENABLED),
      ])
      setSupported(hasHardware)
      setEnrolled(isEnrolled)
      setUnlockEnabled(pref === 'true')
    }
    checkBiometrics()
  }, [])

  const promptBiometrics = async () => {
    if (!supported || !enrolled || !unlockEnabled) return
    setLocked(true)
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock FTS',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    })
    if (result.success) {
      setLocked(false)
    }
    // On failure/cancel: keep locked = true, retry UI is shown
  }

  // Re-read preference whenever token changes (e.g. after enabling in Settings)
  useEffect(() => {
    secureStorage.get(STORAGE_KEYS.BIOMETRIC_ENABLED).then((pref) => {
      setUnlockEnabled(pref === 'true')
    })
  }, [token])

  // Listen to AppState transitions
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackgrounded = appState.current.match(/inactive|background/)
      const isNowActive = nextState === 'active'

      if (wasBackgrounded && isNowActive && token) {
        promptBiometrics()
      }

      appState.current = nextState
    })

    return () => subscription.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, supported, enrolled, unlockEnabled])

  if (locked) {
    return (
      <View style={styles.overlay}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>App Locked</Text>
        <Text style={styles.subtitle}>Authenticate to continue</Text>
        <TouchableOpacity style={styles.retryButton} onPress={promptBiometrics}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <>{children}</>
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  lockIcon: {
    fontSize: 64,
    marginBottom: spacing[4],
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing[2],
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.base,
    marginBottom: spacing[8],
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.gold,
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[3],
    borderRadius: 8,
  },
  retryText: {
    color: colors.bg,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
})
