/**
 * CryptoService — mobile RSA + AES-GCM hybrid encryption.
 * Mirrors web/src/lib/crypto.ts using crypto.subtle (available in Hermes on Expo SDK 54).
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
import { ENV } from './env'

// Lazily resolve Sentry to avoid hard dependency before initSentry() is called.
let Sentry: { captureException: (err: unknown, ctx?: object) => void } | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require('@sentry/react-native')
} catch {
  // Sentry not installed — captureException calls will be no-ops
}

export interface EncryptedPayload {
  wrappedKey: string  // base64url: RSA-OAEP encrypted AES-256 key
  iv: string          // base64url: 12-byte random IV
  ciphertext: string  // base64url: AES-GCM ciphertext + 16-byte auth tag
  aad: string         // base64url: JSON { userId, ts, purpose }
  ts: number          // Unix seconds timestamp
}

export interface CryptoConfig {
  transport_encryption: boolean
}

export class CryptoService {
  private static publicKey: CryptoKey | null = null
  private static transportEncryptionEnabled = false

  /** Returns true when transport encryption is enabled and a public key is cached. */
  static isEnabled(): boolean {
    return this.transportEncryptionEnabled && this.publicKey !== null
  }

  /**
   * Fetches crypto config from GET /api/crypto/config and caches the
   * transport_encryption flag. If enabled, also fetches the public key.
   * Requirement 2.1
   */
  static async fetchCryptoConfig(): Promise<void> {
    try {
      const res = await fetch(`${ENV.API_URL}/api/crypto/config`)
      if (!res.ok) throw new Error(`crypto/config responded ${res.status}`)
      const data: CryptoConfig = await res.json()
      this.transportEncryptionEnabled = data.transport_encryption === true

      if (this.transportEncryptionEnabled) {
        await this.fetchPublicKey()
      }
    } catch (err) {
      Sentry?.captureException(err, { extra: { context: 'fetchCryptoConfig' } })
      // Non-fatal: fall back to unencrypted submission (Req 2.5)
    }
  }

  /**
   * Fetches the RSA public key from GET /api/crypto/public-key and imports it.
   * Requirement 2.4
   */
  static async fetchPublicKey(): Promise<void> {
    try {
      const res = await fetch(`${ENV.API_URL}/api/crypto/public-key`)
      if (!res.ok) throw new Error(`crypto/public-key responded ${res.status}`)
      const data = await res.json()
      const pem: string = data.public_key ?? ''
      if (!pem) throw new Error('Empty public key received')
      this.publicKey = await importPublicKey(pem)
    } catch (err) {
      Sentry?.captureException(err, { extra: { context: 'fetchPublicKey' } })
      this.publicKey = null
      throw err  // Re-throw so fetchCryptoConfig can handle graceful fallback
    }
  }

  /**
   * Encrypts plaintext using AES-256-GCM + RSA-OAEP hybrid encryption.
   * When transport_encryption is false, returns plaintext unchanged.
   * If public key is unavailable, logs to Sentry and returns plaintext (graceful fallback).
   * Requirements: 2.2, 2.3, 2.5, 2.6, 2.7
   */
  static async encryptPayload(
    plaintext: string,
    userId?: string
  ): Promise<EncryptedPayload | string> {
    // Req 2.3: passthrough when disabled
    if (!this.transportEncryptionEnabled) {
      return plaintext
    }

    // Req 2.5: graceful fallback if public key unavailable
    if (!this.publicKey) {
      Sentry?.captureException(
        new Error('CryptoService: public key unavailable, falling back to plaintext'),
        { extra: { context: 'encryptPayload' } }
      )
      return plaintext
    }

    // 1. Generate AES-256-GCM key
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt']
    )

    // 2. Generate 12-byte random IV (Req 2.2)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // 3. Build AAD — binds ciphertext to context (Req 2.6)
    const ts = Math.floor(Date.now() / 1000)
    const aadObject = { userId: userId ?? '', ts, purpose: 'credential_encryption' }
    const aadBytes = new TextEncoder().encode(JSON.stringify(aadObject))

    // 4. Encrypt plaintext with AES-GCM
    const plaintextBytes = new TextEncoder().encode(plaintext)
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aadBytes, tagLength: 128 },
      aesKey,
      plaintextBytes
    )

    // 5. Export raw AES key and wrap with RSA-OAEP
    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)
    const wrappedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      this.publicKey,
      rawAesKey
    )

    // 6. Return EncryptedPayload with base64url fields (Req 2.7)
    return {
      wrappedKey: arrayBufferToBase64Url(wrappedKey),
      iv: arrayBufferToBase64Url(iv.buffer as ArrayBuffer),
      ciphertext: arrayBufferToBase64Url(ciphertext),
      aad: arrayBufferToBase64Url(aadBytes.buffer as ArrayBuffer),
      ts,
    }
  }

  /** Reset state — useful for testing. */
  static reset(): void {
    this.publicKey = null
    this.transportEncryptionEnabled = false
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Imports a PEM-encoded RSA public key for RSA-OAEP / SHA-256 encryption.
 */
async function importPublicKey(pem: string): Promise<CryptoKey> {
  const pemHeader = '-----BEGIN PUBLIC KEY-----'
  const pemFooter = '-----END PUBLIC KEY-----'
  const headerIdx = pem.indexOf(pemHeader)
  const footerIdx = pem.indexOf(pemFooter)

  if (headerIdx === -1 || footerIdx === -1 || headerIdx >= footerIdx) {
    throw new Error('CryptoService: invalid PEM public key format')
  }

  const pemContents = pem
    .substring(headerIdx + pemHeader.length, footerIdx)
    .replace(/\s+/g, '')

  const binaryDerString = atob(pemContents)
  const binaryDer = new Uint8Array(binaryDerString.length)
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i)
  }

  return crypto.subtle.importKey(
    'spki',
    binaryDer.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )
}

/**
 * Encodes an ArrayBuffer as a base64url string (no padding).
 * Requirement 2.7
 */
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
