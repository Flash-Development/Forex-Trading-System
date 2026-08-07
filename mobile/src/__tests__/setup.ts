// Mock react-native Platform before any tests run
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

// Mock @sentry/react-native
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  init: jest.fn(),
  wrap: jest.fn((c: unknown) => c),
}), { virtual: true })

// Provide a minimal crypto.subtle shim for the Node test environment
// (Node 18+ has globalThis.crypto.subtle natively, but jest-expo may use jsdom)
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = require('crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}
