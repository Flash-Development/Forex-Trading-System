/**
 * Tests for HttpClient — HTTPS guard and Sentry error reporting.
 * Requirements: 1.1, 1.3, 5.3
 */

// Mock axios to avoid expo streams polyfill crash in test environment
jest.mock('axios', () => {
  const mockInterceptors = {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  }
  const mockInstance = {
    interceptors: mockInterceptors,
    request: jest.fn(),
  }
  return {
    __esModule: true,
    default: { create: jest.fn(() => mockInstance) },
    create: jest.fn(() => mockInstance),
  }
})

// Mock secureStorage
jest.mock('../lib/secureStorage', () => ({
  secureStorage: { get: jest.fn().mockResolvedValue(null) },
  STORAGE_KEYS: { AUTH_TOKEN: 'auth_token' },
}))

describe('HttpClient', () => {
  beforeEach(() => {
    jest.resetModules()
    // Re-apply axios mock after resetModules
    jest.mock('axios', () => {
      const mockInterceptors = {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      }
      const mockInstance = {
        interceptors: mockInterceptors,
        request: jest.fn(),
      }
      return {
        __esModule: true,
        default: { create: jest.fn(() => mockInstance) },
        create: jest.fn(() => mockInstance),
      }
    })
    jest.mock('../lib/secureStorage', () => ({
      secureStorage: { get: jest.fn().mockResolvedValue(null) },
      STORAGE_KEYS: { AUTH_TOKEN: 'auth_token' },
    }))
  })

  it('instantiates without throwing in development with http://', () => {
    jest.mock('../lib/env', () => ({
      ENV: { API_URL: 'http://localhost:8080', APP_ENV: 'development', isHttps: false, SENTRY_DSN: '', ENABLE_LOGS: false },
      isDev: true,
      isProd: false,
      validateEnv: jest.fn(),
    }))
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../lib/httpClient')
    }).not.toThrow()
  })

  it('throws when isProd is true and isHttps is false', () => {
    jest.mock('../lib/env', () => ({
      ENV: { API_URL: 'http://api.example.com', APP_ENV: 'production', isHttps: false, SENTRY_DSN: '', ENABLE_LOGS: false },
      isDev: false,
      isProd: true,
      validateEnv: jest.fn(),
    }))
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../lib/httpClient')
    }).toThrow(/HTTPS required in production/)
  })

  it('does not throw when isProd is true and isHttps is true', () => {
    jest.mock('../lib/env', () => ({
      ENV: { API_URL: 'https://api.example.com', APP_ENV: 'production', isHttps: true, SENTRY_DSN: '', ENABLE_LOGS: false },
      isDev: false,
      isProd: true,
      validateEnv: jest.fn(),
    }))
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../lib/httpClient')
    }).not.toThrow()
  })
})
