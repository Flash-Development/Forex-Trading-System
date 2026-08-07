import { httpClient, API_BASE } from '../httpClient'
import { secureStorage, STORAGE_KEYS } from '../secureStorage'

export interface AuthUser {
  id: string
  email: string
}

export interface StoredAuth {
  token: string
  user: AuthUser
  expiresAt: number // unix ms
}

// Backend returns flat shape: { token, user_id, email }
interface BackendLoginResponse {
  token: string
  user_id: string
  email: string
  message: string
}

// Decode JWT expiry from payload without a library (payload is base64url)
function getJwtExpiry(token: string): number {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return decoded.exp ? decoded.exp * 1000 : Date.now() + 24 * 60 * 60 * 1000
  } catch {
    return Date.now() + 24 * 60 * 60 * 1000
  }
}

async function persistAuth(token: string, user: AuthUser): Promise<StoredAuth> {
  const expiresAt = getJwtExpiry(token)
  const stored: StoredAuth = { token, user, expiresAt }
  await secureStorage.set(STORAGE_KEYS.AUTH_TOKEN, token)
  await secureStorage.set(STORAGE_KEYS.AUTH_USER, JSON.stringify(user))
  await secureStorage.set(STORAGE_KEYS.AUTH_EXPIRES_AT, String(expiresAt))
  return stored
}

export const authApi = {
  async login(email: string, password: string): Promise<StoredAuth> {
    const res = await httpClient.post<BackendLoginResponse>(
      `${API_BASE}/login`,
      { email, password }
    )
    if (!res.success) throw new Error(res.message ?? 'Login failed')
    const { token, user_id, email: userEmail } = res.data!
    return persistAuth(token, { id: user_id, email: userEmail })
  },

  async register(
    email: string,
    password: string,
    lang = 'en'
  ): Promise<StoredAuth> {
    const res = await httpClient.post<BackendLoginResponse>(
      `${API_BASE}/register`,
      { email, password, lang }
    )
    if (!res.success) throw new Error(res.message ?? 'Registration failed')
    const { token, user_id, email: userEmail } = res.data!
    return persistAuth(token, { id: user_id, email: userEmail })
  },

  async logout(): Promise<void> {
    // Tell the backend to blacklist the token
    try {
      await httpClient.post(`${API_BASE}/logout`)
    } catch {
      // Best-effort — always clear local storage regardless
    }
    await secureStorage.multiDelete([
      STORAGE_KEYS.AUTH_TOKEN,
      STORAGE_KEYS.AUTH_USER,
      STORAGE_KEYS.AUTH_EXPIRES_AT,
    ])
  },

  async getStoredAuth(): Promise<StoredAuth | null> {
    const token = await secureStorage.get(STORAGE_KEYS.AUTH_TOKEN)
    const userStr = await secureStorage.get(STORAGE_KEYS.AUTH_USER)
    const expiresAtStr = await secureStorage.get(STORAGE_KEYS.AUTH_EXPIRES_AT)
    if (!token || !userStr) return null

    const expiresAt = expiresAtStr ? Number(expiresAtStr) : getJwtExpiry(token)

    // Treat token as expired if within 5 minutes of expiry
    if (Date.now() >= expiresAt - 5 * 60 * 1000) return null

    return { token, user: JSON.parse(userStr), expiresAt }
  },

  isTokenExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt - 5 * 60 * 1000
  },
}
