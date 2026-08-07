/**
 * Tests for CryptoService.
 * Requirements: 2.2, 2.3, 2.6, 2.7
 */
import { CryptoService, arrayBufferToBase64Url, EncryptedPayload } from '../lib/crypto'

// Mock fetch globally
global.fetch = jest.fn()

const BASE64URL_RE = /^[A-Za-z0-9\-_]+$/

describe('CryptoService', () => {
  beforeEach(() => {
    CryptoService.reset()
    jest.clearAllMocks()
  })

  describe('isEnabled()', () => {
    it('returns false by default', () => {
      expect(CryptoService.isEnabled()).toBe(false)
    })
  })

  describe('encryptPayload() — passthrough when disabled', () => {
    it('returns plaintext unchanged when transport_encryption is false', async () => {
      // Default state: transportEncryptionEnabled = false
      const result = await CryptoService.encryptPayload('hello world')
      expect(result).toBe('hello world')
    })

    it('returns empty string unchanged when disabled', async () => {
      const result = await CryptoService.encryptPayload('')
      expect(result).toBe('')
    })
  })

  describe('fetchCryptoConfig()', () => {
    it('sets transportEncryptionEnabled to false when config says false', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transport_encryption: false }),
      })
      await CryptoService.fetchCryptoConfig()
      expect(CryptoService.isEnabled()).toBe(false)
    })

    it('handles fetch failure gracefully (no throw)', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network error'))
      await expect(CryptoService.fetchCryptoConfig()).resolves.toBeUndefined()
    })
  })

  describe('arrayBufferToBase64Url()', () => {
    it('produces valid base64url output (no +, /, or = chars)', () => {
      const buf = new Uint8Array([0xfb, 0xff, 0xfe, 0x00, 0x01]).buffer
      const result = arrayBufferToBase64Url(buf)
      expect(result).toMatch(BASE64URL_RE)
      expect(result).not.toContain('+')
      expect(result).not.toContain('/')
      expect(result).not.toContain('=')
    })

    it('encodes empty buffer to empty string', () => {
      const result = arrayBufferToBase64Url(new ArrayBuffer(0))
      expect(result).toBe('')
    })
  })
})
