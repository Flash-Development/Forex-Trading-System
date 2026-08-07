/**
 * useBiometricUnlock — manages the biometric app-unlock preference.
 *
 * Biometrics here means: when the app resumes from background, prompt
 * Face ID / fingerprint to unlock. It does NOT log the user in.
 *
 * Enabling requires password confirmation to prevent accidental activation.
 * Disabling requires no confirmation.
 */
import { useState, useEffect, useCallback } from 'react'
import * as LocalAuthentication from 'expo-local-authentication'
import { secureStorage, STORAGE_KEYS } from '../lib/secureStorage'
import { useAuthStore } from '../stores/authStore'
import { authApi } from '../lib/api/auth'

export interface BiometricUnlockState {
  /** Device has biometric hardware and enrolled credentials */
  available: boolean
  /** User has opted in to biometric unlock */
  enabled: boolean
  /**
   * Validates password against the server, then enables biometric unlock.
   * Throws with a descriptive message if the password is wrong.
   */
  enableWithPassword: (password: string) => Promise<void>
  /** Disables biometric unlock — no password required */
  disable: () => Promise<void>
}

export function useBiometricUnlock(): BiometricUnlockState {
  const { user } = useAuthStore()
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    async function init() {
      const [hasHardware, isEnrolled, storedPref] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        secureStorage.get(STORAGE_KEYS.BIOMETRIC_ENABLED),
      ])
      setAvailable(hasHardware && isEnrolled)
      setEnabled(storedPref === 'true')
    }
    init()
  }, [])

  const enableWithPassword = useCallback(async (password: string) => {
    if (!user?.email) throw new Error('No active session.')
    // Validate password against the server before enabling
    await authApi.login(user.email, password)
    await secureStorage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, 'true')
    setEnabled(true)
  }, [user])

  const disable = useCallback(async () => {
    await secureStorage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, 'false')
    setEnabled(false)
  }, [])

  return { available, enabled, enableWithPassword, disable }
}

// Keep old export name as alias so existing imports don't break
export { useBiometricUnlock as useBiometricLogin }
export type { BiometricUnlockState as BiometricLoginState }
