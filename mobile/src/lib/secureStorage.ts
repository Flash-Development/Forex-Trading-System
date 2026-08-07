/**
 * Secure token storage using expo-secure-store.
 * Falls back to in-memory on web (SecureStore is native-only).
 */
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// In-memory fallback for web/testing
const memStore: Record<string, string> = {}

export const secureStorage = {
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      memStore[key] = value
      return
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  },

  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return memStore[key] ?? null
    return SecureStore.getItemAsync(key)
  },

  async delete(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      delete memStore[key]
      return
    }
    await SecureStore.deleteItemAsync(key)
  },

  async multiDelete(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.delete(k)))
  },
}

// Storage keys — centralised to avoid typos
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'fts_auth_token',
  AUTH_USER: 'fts_auth_user',
  AUTH_EXPIRES_AT: 'fts_auth_expires_at',
  BIOMETRIC_ENABLED: 'fts_biometric_enabled',
} as const
