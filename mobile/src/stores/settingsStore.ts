import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Locale } from '../lib/i18n'

const KEYS = {
  locale: 'fts_locale',
  theme: 'fts_theme',
  paperMode: 'fts_paper_mode',
  offlineCache: 'fts_offline_cache',
}

export type Theme = 'dark' | 'light'

interface OfflineCache {
  account: any | null
  positions: any[] | null
  traders: any[] | null
  stats: any | null
  cachedAt: number
}

interface SettingsState {
  locale: Locale
  theme: Theme
  paperMode: boolean
  offlineCache: OfflineCache
  isHydrated: boolean

  setLocale: (l: Locale) => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setPaperMode: (v: boolean) => void
  saveOfflineCache: (data: Partial<OfflineCache>) => void
  hydrate: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  locale: 'en',
  theme: 'dark',
  paperMode: false,
  isHydrated: false,
  offlineCache: { account: null, positions: null, traders: null, stats: null, cachedAt: 0 },

  setLocale: async (locale) => {
    set({ locale })
    await AsyncStorage.setItem(KEYS.locale, locale)
  },

  setTheme: async (theme) => {
    set({ theme })
    await AsyncStorage.setItem(KEYS.theme, theme)
  },

  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  setPaperMode: async (paperMode) => {
    set({ paperMode })
    await AsyncStorage.setItem(KEYS.paperMode, paperMode ? '1' : '0')
  },

  saveOfflineCache: async (data) => {
    const next: OfflineCache = { ...get().offlineCache, ...data, cachedAt: Date.now() }
    set({ offlineCache: next })
    await AsyncStorage.setItem(KEYS.offlineCache, JSON.stringify(next))
  },

  hydrate: async () => {
    const [locale, theme, paper, cacheStr] = await Promise.all([
      AsyncStorage.getItem(KEYS.locale),
      AsyncStorage.getItem(KEYS.theme),
      AsyncStorage.getItem(KEYS.paperMode),
      AsyncStorage.getItem(KEYS.offlineCache),
    ])
    const offlineCache = cacheStr ? JSON.parse(cacheStr) : get().offlineCache
    set({
      locale: (locale as Locale) ?? 'en',
      theme: (theme as Theme) ?? 'dark',
      paperMode: paper === '1',
      offlineCache,
      isHydrated: true,
    })
  },
}))
