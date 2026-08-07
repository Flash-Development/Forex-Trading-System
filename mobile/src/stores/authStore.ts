import { create } from 'zustand'
import { authApi, type AuthUser } from '../lib/api/auth.ts'
import { register401Handler } from '../lib/httpClient.ts'

interface AuthState {
  user: AuthUser | null
  token: string | null
  expiresAt: number | null
  isLoading: boolean
  isHydrated: boolean

  hydrate: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, lang?: string) => Promise<void>
  logout: () => Promise<void>
  /** Returns true if the stored token is expired or about to expire */
  isExpired: () => boolean
}

// Module-level timer so it survives re-renders
let _expiryTimer: ReturnType<typeof setTimeout> | null = null

function scheduleExpiry(expiresAt: number, onExpire: () => void) {
  if (_expiryTimer) clearTimeout(_expiryTimer)
  const msUntilExpiry = expiresAt - Date.now() - 5 * 60 * 1000 // 5 min early
  if (msUntilExpiry <= 0) {
    onExpire()
    return
  }
  _expiryTimer = setTimeout(onExpire, msUntilExpiry)
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Wire 401 → auto logout once at store creation
  register401Handler(() => {
    if (get().token) get().logout()
  })

  return {
    user: null,
    token: null,
    expiresAt: null,
    isLoading: true,
    isHydrated: false,

    hydrate: async () => {
      const stored = await authApi.getStoredAuth()
      if (stored) {
        set({
          user: stored.user,
          token: stored.token,
          expiresAt: stored.expiresAt,
          isLoading: false,
          isHydrated: true,
        })
        scheduleExpiry(stored.expiresAt, () => get().logout())
      } else {
        // Token missing or expired — clear and force re-login
        await authApi.logout()
        set({ user: null, token: null, expiresAt: null, isLoading: false, isHydrated: true })
      }
    },

    login: async (email, password) => {
      const stored = await authApi.login(email, password)
      set({ token: stored.token, user: stored.user, expiresAt: stored.expiresAt })
      scheduleExpiry(stored.expiresAt, () => get().logout())
    },

    register: async (email, password, lang = 'en') => {
      const stored = await authApi.register(email, password, lang)
      set({ token: stored.token, user: stored.user, expiresAt: stored.expiresAt })
      scheduleExpiry(stored.expiresAt, () => get().logout())
    },

    logout: async () => {
      if (_expiryTimer) { clearTimeout(_expiryTimer); _expiryTimer = null }
      await authApi.logout()
      set({ user: null, token: null, expiresAt: null })
    },

    isExpired: () => {
      const { expiresAt } = get()
      if (!expiresAt) return true
      return authApi.isTokenExpired(expiresAt)
    },
  }
})
