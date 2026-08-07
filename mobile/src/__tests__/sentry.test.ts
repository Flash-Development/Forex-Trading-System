/**
 * Tests for Sentry initialisation module — redactSensitiveFields.
 * Requirements: 5.1, 5.2, 5.4, 5.5, 5.6
 */

import * as fc from 'fast-check'
import { redactSensitiveFields } from '../lib/sentry'

// @sentry/react-native is mocked in setup.ts

describe('redactSensitiveFields', () => {
  /**
   * Property 7: Sentry redaction removes sensitive fields
   * For any event object containing fields named password, token, secret, key,
   * or an Authorization header, after redactSensitiveFields is applied,
   * none of those field values SHALL appear in the output event.
   *
   * Feature: mobile-security-optimization, Property 7
   * Validates: Requirements 5.6
   */
  it('Property 7: redacts all sensitive field values from event extra', () => {
    const SENSITIVE_KEYS = ['password', 'token', 'secret', 'key', 'PASSWORD', 'Token', 'SECRET', 'Key']

    fc.assert(
      fc.property(
        // Generate a sensitive key (from the pattern) and a non-empty value
        fc.constantFrom(...SENSITIVE_KEYS),
        fc.string({ minLength: 1 }),
        (sensitiveKey, sensitiveValue) => {
          const event = {
            extra: { [sensitiveKey]: sensitiveValue, safeField: 'safe-value' },
          }
          const result = redactSensitiveFields(event as any)
          const extra = result.extra as Record<string, unknown>
          // The field must be replaced with '[Redacted]', not the original value
          return extra[sensitiveKey] === '[Redacted]'
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: redacts Authorization header values', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (authValue) => {
          const event = {
            request: {
              headers: { Authorization: authValue, 'Content-Type': 'application/json' },
            },
          }
          const result = redactSensitiveFields(event as any)
          const headers = result.request?.headers as Record<string, unknown>
          return headers['Authorization'] === '[Redacted]'
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 7: does not redact non-sensitive fields', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (safeValue) => {
          const event = {
            extra: { username: safeValue, email: safeValue },
          }
          const result = redactSensitiveFields(event as any)
          const extra = result.extra as Record<string, unknown>
          return extra['username'] === safeValue && extra['email'] === safeValue
        }
      ),
      { numRuns: 100 }
    )
  })

  it('handles event with no sensitive fields unchanged', () => {
    const event = {
      message: 'test error',
      extra: { userId: '123', action: 'login' },
    }
    const result = redactSensitiveFields(event as any)
    const extra = result.extra as Record<string, unknown>
    expect(extra['userId']).toBe('123')
    expect(extra['action']).toBe('login')
  })

  it('handles event with no extra or request fields', () => {
    const event = { message: 'bare event' }
    expect(() => redactSensitiveFields(event as any)).not.toThrow()
  })
})

describe('initSentry', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.mock('@sentry/react-native', () => ({
      init: jest.fn(),
      captureException: jest.fn(),
      wrap: jest.fn((c: unknown) => c),
    }), { virtual: true })
  })

  it('calls Sentry.init with dsn and environment when DSN is set', () => {
    jest.mock('../lib/env', () => ({
      ENV: { API_URL: 'https://api.example.com', APP_ENV: 'production', isHttps: true, SENTRY_DSN: 'https://key@sentry.io/123', ENABLE_LOGS: false },
      isDev: false,
      isProd: true,
    }))
    const Sentry = require('@sentry/react-native')
    const { initSentry } = require('../lib/sentry')
    initSentry()
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@sentry.io/123',
        environment: 'production',
        debug: false,
        tracesSampleRate: 0.2,
      })
    )
  })

  it('does not call Sentry.init when DSN is empty', () => {
    jest.mock('../lib/env', () => ({
      ENV: { API_URL: 'http://localhost:8080', APP_ENV: 'development', isHttps: false, SENTRY_DSN: '', ENABLE_LOGS: false },
      isDev: true,
      isProd: false,
    }))
    const Sentry = require('@sentry/react-native')
    const { initSentry } = require('../lib/sentry')
    initSentry()
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('uses debug=true and tracesSampleRate=1.0 in development', () => {
    jest.mock('../lib/env', () => ({
      ENV: { API_URL: 'http://localhost:8080', APP_ENV: 'development', isHttps: false, SENTRY_DSN: 'https://key@sentry.io/456', ENABLE_LOGS: false },
      isDev: true,
      isProd: false,
    }))
    const Sentry = require('@sentry/react-native')
    const { initSentry } = require('../lib/sentry')
    initSentry()
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ debug: true, tracesSampleRate: 1.0 })
    )
  })
})
