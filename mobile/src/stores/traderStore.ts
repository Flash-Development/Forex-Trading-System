import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TraderInfo, AccountInfo, Position } from '../types'
import { traderApi, dataApi } from '../lib/api'
import { useSettingsStore } from './settingsStore'

const SELECTED_TRADER_KEY = 'fts_selected_trader_id'

interface TraderState {
  traders: TraderInfo[]
  selectedTraderId: string | undefined
  account: AccountInfo | null
  positions: Position[]
  isLoading: boolean
  error: string | null

  hydrate: () => Promise<void>
  setSelectedTrader: (id: string) => void
  fetchTraders: () => Promise<void>
  fetchDashboard: (traderId: string) => Promise<void>
}

export const useTraderStore = create<TraderState>((set, get) => ({
  traders: [],
  selectedTraderId: undefined,
  account: null,
  positions: [],
  isLoading: false,
  error: null,

  hydrate: async () => {
    const stored = await AsyncStorage.getItem(SELECTED_TRADER_KEY)
    if (stored) set({ selectedTraderId: stored })
  },

  setSelectedTrader: (id) => {
    set({ selectedTraderId: id })
    AsyncStorage.setItem(SELECTED_TRADER_KEY, id)
  },

  fetchTraders: async () => {
    set({ isLoading: true, error: null })
    try {
      const traders = await traderApi.getTraders()
      set({ traders, isLoading: false })
      // Auto-select first trader only if nothing is persisted
      if (!get().selectedTraderId && traders.length > 0) {
        get().setSelectedTrader(traders[0].trader_id)
      }
    } catch (e: any) {
      set({ error: e.message, isLoading: false })
    }
  },

  fetchDashboard: async (traderId) => {
    set({ isLoading: true, error: null })
    try {
      const [account, positions] = await Promise.all([
        dataApi.getAccount(traderId),
        dataApi.getPositions(traderId),
      ])
      set({ account, positions, isLoading: false })
      // Persist to offline cache
      useSettingsStore.getState().saveOfflineCache({ account, positions, traders: get().traders })
    } catch (e: any) {
      // Fall back to offline cache on network error
      const cache = useSettingsStore.getState().offlineCache
      if (cache.account) {
        set({ account: cache.account, positions: cache.positions ?? [], isLoading: false, error: 'Offline — showing cached data' })
      } else {
        set({ error: e.message, isLoading: false })
      }
    }
  },
}))
