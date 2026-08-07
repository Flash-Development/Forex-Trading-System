/**
 * Notification service — Expo Notifications (wraps FCM on Android, APNs on iOS).
 *
 * Responsibilities:
 *  1. Request permission and get Expo push token
 *  2. Fire local notifications for trade events detected via SWR polling
 *  3. Store notification preferences in SecureStore
 */
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { secureStorage } from './secureStorage'

// True when running inside Expo Go (push tokens not supported since SDK 53)
const IS_EXPO_GO = Constants.appOwnership === 'expo'

export const NOTIF_KEYS = {
  PUSH_TOKEN: 'fts_push_token',
  PREFS: 'fts_notif_prefs',
} as const

export interface NotifPrefs {
  tradeExecuted: boolean   // order FILLED
  aiDecision: boolean      // new AI decision cycle
  riskAlert: boolean       // margin > 80% or liquidation near
  traderStatus: boolean    // trader started / stopped
}

export const DEFAULT_PREFS: NotifPrefs = {
  tradeExecuted: true,
  aiDecision: false,
  riskAlert: true,
  traderStatus: true,
}

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export const notificationService = {
  async requestPermission(): Promise<boolean> {
    if (!Device.isDevice) return false // simulators don't support push

    const { status: existing } = await Notifications.getPermissionsAsync()
    if (existing === 'granted') return true

    const { status } = await Notifications.requestPermissionsAsync()
    if (status !== 'granted') return false

    // Android needs a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('fts-trades', {
        name: 'Trade Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F0B90B',
        sound: 'default',
      })
      await Notifications.setNotificationChannelAsync('fts-risk', {
        name: 'Risk Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#F6465D',
        sound: 'default',
      })
      await Notifications.setNotificationChannelAsync('fts-system', {
        name: 'System',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      })
    }
    return true
  },

  async getExpoPushToken(): Promise<string | null> {
    if (IS_EXPO_GO) return null // not supported in Expo Go since SDK 53
    try {
      const cached = await secureStorage.get(NOTIF_KEYS.PUSH_TOKEN)
      if (cached) return cached
      const token = (await Notifications.getExpoPushTokenAsync()).data
      await secureStorage.set(NOTIF_KEYS.PUSH_TOKEN, token)
      return token
    } catch {
      return null
    }
  },

  async getPrefs(): Promise<NotifPrefs> {
    try {
      const raw = await secureStorage.get(NOTIF_KEYS.PREFS)
      return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
    } catch {
      return DEFAULT_PREFS
    }
  },

  async savePrefs(prefs: NotifPrefs): Promise<void> {
    await secureStorage.set(NOTIF_KEYS.PREFS, JSON.stringify(prefs))
  },

  // ── Local notification triggers ──────────────────────────────────────────

  async notifyTradeExecuted(symbol: string, action: string, price: number) {
    const prefs = await this.getPrefs()
    if (!prefs.tradeExecuted) return
    const isOpen = action.startsWith('open')
    const side = action.includes('long') ? 'LONG' : 'SHORT'
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${isOpen ? '📈' : '📉'} Trade ${isOpen ? 'Opened' : 'Closed'}`,
        body: `${symbol} ${side} @ $${price.toFixed(4)}`,
        data: { type: 'trade', symbol, action },
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'fts-trades' }),
      },
      trigger: null, // immediate
    })
  },

  async notifyAIDecision(traderName: string, cycleNum: number, actionCount: number) {
    const prefs = await this.getPrefs()
    if (!prefs.aiDecision) return
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🤖 AI Decision',
        body: `${traderName} · Cycle #${cycleNum} · ${actionCount} action${actionCount !== 1 ? 's' : ''}`,
        data: { type: 'decision' },
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'fts-system' }),
      },
      trigger: null,
    })
  },

  async notifyRiskAlert(traderName: string, message: string) {
    const prefs = await this.getPrefs()
    if (!prefs.riskAlert) return
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Risk Alert',
        body: `${traderName}: ${message}`,
        data: { type: 'risk' },
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'fts-risk' }),
      },
      trigger: null,
    })
  },

  async notifyTraderStatus(traderName: string, isRunning: boolean) {
    const prefs = await this.getPrefs()
    if (!prefs.traderStatus) return
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isRunning ? '▶ Trader Started' : '■ Trader Stopped',
        body: traderName,
        data: { type: 'status' },
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'fts-system' }),
      },
      trigger: null,
    })
  },
}
