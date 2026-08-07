/**
 * Sentry error monitoring initialisation.
 * Requirements: 5.1, 5.2, 5.4, 5.5, 5.6
 *
 * SENTRY_DSN must NOT be prefixed with EXPO_PUBLIC_ — it is read at build time
 * via a custom Expo config plugin or EAS Secret and is never bundled into the JS bundle.
 *
 * @sentry/react-native is loaded dynamically so the app bundles even when the
 * package has not yet been installed (e.g. during local development before
 * running `npx expo install @sentry/react-native`).
 */
import { ENV, isProd } from './env'

// Lazily resolve Sentry — graceful no-op when package is not installed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require('@sentry/react-native')
} catch {
  // package not installed — all Sentry calls will be no-ops
}

/** Minimal shape of a Sentry event — avoids hard dependency on @sentry/react-native types. */
export interface SentryEvent {
  message?: string
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  request?: {
    headers?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Redacts sensitive field values from a Sentry event before transmission.
 * Strips values of keys matching password|token|secret|key and redacts
 * Authorization header values.
 * Requirement 5.6
 */
export function redactSensitiveFields(event: SentryEvent): SentryEvent {
  const SENSITIVE_KEY_PATTERN = /password|token|secret|key/i

  function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        result[k] = '[Redacted]'
      } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        result[k] = redactObject(v as Record<string, unknown>)
      } else {
        result[k] = v
      }
    }
    return result
  }

  const cleaned: SentryEvent = { ...event }

  // Redact extra context fields
  if (cleaned.extra) {
    cleaned.extra = redactObject(cleaned.extra)
  }

  // Redact request headers — specifically Authorization
  if (cleaned.request?.headers) {
    const headers = { ...cleaned.request.headers }
    if (headers['Authorization'] !== undefined) {
      headers['Authorization'] = '[Redacted]'
    }
    if (headers['authorization'] !== undefined) {
      headers['authorization'] = '[Redacted]'
    }
    cleaned.request = { ...cleaned.request, headers }
  }

  // Redact contexts
  if (cleaned.contexts) {
    cleaned.contexts = redactObject(cleaned.contexts)
  }

  return cleaned
}

/**
 * Initialises the Sentry SDK.
 * Must be called immediately after validateEnv() in App.tsx, before any other app logic.
 * Requirement 5.1
 */
export function initSentry(): void {
  if (!ENV.SENTRY_DSN) {
    if (!isProd) {
      console.warn('Sentry: SENTRY_DSN is not set — error reporting disabled')
    }
    return
  }

  if (!Sentry) {
    console.warn('Sentry: @sentry/react-native is not installed — error reporting disabled')
    return
  }

  Sentry.init({
    dsn: ENV.SENTRY_DSN,
    environment: ENV.APP_ENV,
    // Requirement 5.4: debug mode in development
    debug: !isProd,
    // Requirement 5.4 / 5.5: 100% error capture in prod, reduced in dev
    tracesSampleRate: isProd ? 0.2 : 1.0,
    // Requirement 5.6: redact sensitive fields before sending
    beforeSend(event: SentryEvent) {
      return redactSensitiveFields(event)
    },
  })
}
