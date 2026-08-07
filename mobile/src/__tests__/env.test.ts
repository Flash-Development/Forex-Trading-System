/**
 * Tests for ENV module — validateEnv() and isHttps flag.
 * Requirements: 1.1, 1.2, 1.4, 4.1, 4.3, 4.4
 */

// We need to re-import the module with different env vars for each test,
// so we use jest.resetModules() + require() inside each test.

const VALID_ENVS = ['development', 'staging', 'production'] as const

function loadEnv(overrides: Record<string, string | undefined>) {
  jest.resetModules()
  // Apply env overrides
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../lib/env')
  // Restore
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return mod
}

describe('ENV module', () => {
  describe('isHttps', () => {
    it('is true when API_URL starts with https://', () => {
      const { ENV } = loadEnv({ EXPO_PUBLIC_API_URL: 'https://api.example.com' })
      expect(ENV.isHttps).toBe(true)
    })

    it('is false when API_URL starts with http://', () => {
      const { ENV } = loadEnv({ EXPO_PUBLIC_API_URL: 'http://localhost:8080' })
      expect(ENV.isHttps).toBe(false)
    })
  })

  describe('validateEnv()', () => {
    it('does not throw for valid production HTTPS config', () => {
      const { validateEnv } = loadEnv({
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
        EXPO_PUBLIC_APP_ENV: 'production',
      })
      expect(() => validateEnv()).not.toThrow()
    })

    it('throws when APP_ENV is production and API_URL is http://', () => {
      const { validateEnv } = loadEnv({
        EXPO_PUBLIC_API_URL: 'http://api.example.com',
        EXPO_PUBLIC_APP_ENV: 'production',
      })
      expect(() => validateEnv()).toThrow(/HTTPS/)
    })

    it('does not throw when APP_ENV is development and API_URL is http://', () => {
      const { validateEnv } = loadEnv({
        EXPO_PUBLIC_API_URL: 'http://localhost:8080',
        EXPO_PUBLIC_APP_ENV: 'development',
      })
      expect(() => validateEnv()).not.toThrow()
    })

    it('throws when APP_ENV is invalid', () => {
      const { validateEnv } = loadEnv({
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
        EXPO_PUBLIC_APP_ENV: 'invalid_env',
      })
      expect(() => validateEnv()).toThrow(/APP_ENV/)
    })

    it('throws when API_URL is empty', () => {
      // validateEnv checks ENV.API_URL directly; test by calling it with a patched ENV
      jest.resetModules()
      jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
      const envMod = require('../lib/env')
      // Temporarily patch ENV.API_URL to empty to test the guard
      const original = envMod.ENV.API_URL
      Object.defineProperty(envMod.ENV, 'API_URL', { value: '', configurable: true, writable: true })
      expect(() => envMod.validateEnv()).toThrow(/API_URL/)
      Object.defineProperty(envMod.ENV, 'API_URL', { value: original, configurable: true, writable: true })
    })

    it('does not throw for staging with https', () => {
      const { validateEnv } = loadEnv({
        EXPO_PUBLIC_API_URL: 'https://staging.example.com',
        EXPO_PUBLIC_APP_ENV: 'staging',
      })
      expect(() => validateEnv()).not.toThrow()
    })
  })
})
