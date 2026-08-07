import { Platform } from 'react-native'

/**
 * Environment configuration.
 * EXPO_PUBLIC_* vars are inlined at build time by Metro — safe for client-side use.
 * Non-prefixed vars (e.g. SENTRY_DSN) are read at build time via config plugins
 * and are NOT bundled into the JS bundle.
 *
 * API_URL defaults:
 *   Android emulator → 10.0.2.2  (maps to host machine localhost)
 *   iOS simulator    → localhost
 *   Physical device  → set EXPO_PUBLIC_API_URL to your LAN IP
 */
function defaultApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  // Only use the env var if it's a non-empty string
  if (envUrl !== undefined && envUrl !== '') return envUrl
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:8080'
    : 'http://localhost:8080'
}

const apiUrl = defaultApiUrl()

export const ENV = {
  API_URL: apiUrl,
  APP_ENV: (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') as
    | 'development'
    | 'staging'
    | 'production',
  ENABLE_LOGS: process.env.EXPO_PUBLIC_ENABLE_LOGS === 'true',
  /** NOT EXPO_PUBLIC_ — read via Expo config plugin or EAS Secret, never bundled */
  SENTRY_DSN: process.env.SENTRY_DSN ?? '',
  /** Derived from API_URL; other modules can reference this without re-parsing */
  isHttps: apiUrl.startsWith('https://'),
} as const

export const isDev = ENV.APP_ENV === 'development'
export const isProd = ENV.APP_ENV === 'production'

const VALID_ENVS = ['development', 'staging', 'production'] as const

/**
 * Validates environment configuration at startup.
 * Throws a descriptive error if:
 *  - API_URL is empty
 *  - APP_ENV is not one of development | staging | production
 *  - APP_ENV is 'production' and API_URL does not use HTTPS
 */
export function validateEnv(): void {
  if (!ENV.API_URL) {
    throw new Error('ENV: API_URL is required')
  }
  if (!(VALID_ENVS as readonly string[]).includes(ENV.APP_ENV)) {
    throw new Error(
      `ENV: APP_ENV must be one of ${VALID_ENVS.join(', ')}, got "${ENV.APP_ENV}"`
    )
  }
  if (ENV.APP_ENV === 'production' && !ENV.isHttps) {
    throw new Error('ENV: API_URL must use HTTPS in production')
  }
}
