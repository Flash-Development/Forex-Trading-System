import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  Switch, TextInput, ScrollView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import useSWR from 'swr'
import * as LocalAuthentication from 'expo-local-authentication'
import { useAuthStore } from '../../stores'
import { useSettingsStore } from '../../stores/settingsStore'
import { httpClient, API_BASE } from '../../lib/httpClient.ts'
import { notificationService, DEFAULT_PREFS, type NotifPrefs } from '../../lib/notifications.ts'
import { useBiometricLogin } from '../../hooks/useBiometricLogin'
import { PasswordConfirmModal } from '../../components/PasswordConfirmModal'
import { colors, spacing, fontSize, fontWeight } from '../../theme'
import styles from './styles.ts'
import SectionHeader from './_components/SectionHeader.tsx'
import SettingsCard from './_components/SettingsCard.tsx'
import ToggleSetting from './_components/ToggleSetting.tsx'
import SettingRow from './_components/SettingRow.tsx'
import CtaBanner from './_components/CtaBanner.tsx'

interface TelegramStatus {
  configured: boolean
  is_bound: boolean
  token_masked: string
  username: string
  model_id: string
}

// ─── main screen ───────────────────────────────────────────────────────────
export function SettingsScreen() {
  const { user, expiresAt, logout } = useAuthStore()
  const { locale, theme, paperMode, setLocale, toggleTheme, setPaperMode } = useSettingsStore()
  const bio = useBiometricLogin()
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  // ── Biometrics ────────────────────────────────────────────────────────────
  const [bioChecked, setBioChecked] = useState(false)

  useEffect(() => {
    Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]).then(() => setBioChecked(true))
  }, [])

  const handleBioToggle = (value: boolean) => {
    if (value) setShowPasswordModal(true)
    else bio.disable()
  }

  const handlePasswordConfirmed = async (password: string) => {
    await bio.enableWithPassword(password)
    setShowPasswordModal(false)
    Alert.alert('Biometric Unlock Enabled', 'The app will lock and prompt Face ID or fingerprint when resumed from background.')
  }

  const handleTestBiometrics = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Test biometric unlock',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    })
    Alert.alert(result.success ? 'Success ✓' : 'Cancelled', result.success ? 'Biometrics are working correctly.' : 'Authentication was cancelled.')
  }

  // ── Telegram ──────────────────────────────────────────────────────────────
  const { data: tg, mutate: mutateTg } = useSWR<TelegramStatus>(`${API_BASE}/telegram`)
  const [botToken, setBotToken] = useState('')
  const [savingTg, setSavingTg] = useState(false)

  const handleSaveTelegram = async () => {
    if (!botToken.trim()) return
    setSavingTg(true)
    try {
      const res = await httpClient.post(`${API_BASE}/telegram`, { bot_token: botToken.trim() })
      if (!res.success) throw new Error(res.message ?? 'Failed to save')
      setBotToken('')
      mutateTg()
      Alert.alert('Saved', 'Bot token saved. Send /start in Telegram to bind your account.')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSavingTg(false)
    }
  }

  const handleUnbindTelegram = () => {
    Alert.alert('Unbind Telegram?', 'Your Telegram account will be disconnected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unbind', style: 'destructive',
        onPress: async () => {
          await httpClient.delete(`${API_BASE}/telegram/binding`)
          mutateTg()
        },
      },
    ])
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)
  const [permGranted, setPermGranted] = useState(false)

  useEffect(() => {
    notificationService.getPrefs().then(setPrefs)
    notificationService.requestPermission().then(setPermGranted)
  }, [])

  const updatePref = useCallback(async (key: keyof NotifPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    await notificationService.savePrefs(next)
  }, [prefs])

  const handleRequestPermission = async () => {
    const granted = await notificationService.requestPermission()
    setPermGranted(granted)
    if (!granted) Alert.alert('Permission denied', 'Enable notifications in your device settings.')
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ])
  }

  const initials = user?.email ? user.email[0].toUpperCase() : '?'
  const expiryLabel = expiresAt ? new Date(expiresAt).toLocaleString() : '—'

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Profile header ── */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.profileEmail}>{user?.email ?? '—'}</Text>
          <Text style={styles.profileMeta}>Token expires {expiryLabel}</Text>
        </View>

        {/* ── Security ── */}
        <SectionHeader label="Security" />
        <SettingsCard>
          {bio.available ? (
            <>
              <ToggleSetting
                icon="🔒"
                label="Biometric Unlock"
                sublabel={bio.enabled ? 'Locks on background' : 'Tap to enable'}
                value={bio.enabled}
                onToggle={handleBioToggle}
              />
              {bio.enabled && (
                <TouchableOpacity style={styles.subAction} onPress={handleTestBiometrics}>
                  <Text style={styles.subActionText}>Test biometrics →</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <SettingRow
              icon="🔒"
              label="Biometric Unlock"
              sublabel={!bioChecked ? 'Checking…' : 'Not available on this device'}
            />
          )}
        </SettingsCard>

        {/* ── Notifications ── */}
        <SectionHeader label="Notifications" />
        {!permGranted ? (
          <CtaBanner
            icon="🔔"
            title="Enable Notifications"
            subtitle="Get trade and risk alerts instantly"
            onPress={handleRequestPermission}
          />
        ) : (
          <SettingsCard>
            <ToggleSetting icon="⚡" label="Trade executed"    value={prefs.tradeExecuted} onToggle={(v) => updatePref('tradeExecuted', v)} />
            <ToggleSetting icon="🤖" label="AI decisions"      value={prefs.aiDecision}    onToggle={(v) => updatePref('aiDecision', v)} />
            <ToggleSetting icon="⚠️" label="Risk alerts"       value={prefs.riskAlert}     onToggle={(v) => updatePref('riskAlert', v)} />
            <ToggleSetting icon="▶" label="Trader start/stop"  value={prefs.traderStatus}  onToggle={(v) => updatePref('traderStatus', v)} />
          </SettingsCard>
        )}

        {/* ── Telegram ── */}
        <SectionHeader label="Telegram Bot" />
        {tg?.configured ? (
          <SettingsCard>
            <SettingRow icon="✈️" label="Bot token" sublabel={tg.token_masked || '—'} />
            <SettingRow
              icon={tg.is_bound ? '✅' : '⏳'}
              label="Status"
              sublabel={tg.is_bound ? `Bound to @${tg.username}` : 'Send /start in Telegram to bind'}
            />
            {tg.is_bound && (
              <TouchableOpacity style={styles.subAction} onPress={handleUnbindTelegram}>
                <Text style={[styles.subActionText, { color: colors.red }]}>Unbind Telegram →</Text>
              </TouchableOpacity>
            )}
          </SettingsCard>
        ) : (
          <>
            <CtaBanner
              icon="✈️"
              title="Connect Telegram Bot"
              subtitle="Control FTS and receive AI updates via chat"
              onPress={() => {}}
            />
            <SettingsCard>
              <TextInput
                style={styles.input}
                value={botToken}
                onChangeText={setBotToken}
                placeholder="Paste bot token from @BotFather"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TouchableOpacity
                style={[styles.saveBtn, (!botToken.trim() || savingTg) && styles.saveBtnDisabled]}
                onPress={handleSaveTelegram}
                disabled={savingTg || !botToken.trim()}
              >
                {savingTg
                  ? <ActivityIndicator color={colors.bg} size="small" />
                  : <Text style={styles.saveBtnText}>SAVE TOKEN</Text>
                }
              </TouchableOpacity>
            </SettingsCard>
          </>
        )}

        {/* ── Preferences ── */}
        <SectionHeader label="Preferences" />
        <SettingsCard>
          <ToggleSetting
            icon="🌙"
            label="Dark Mode"
            sublabel={theme === 'dark' ? 'Currently dark' : 'Currently light'}
            value={theme === 'dark'}
            onToggle={toggleTheme}
          />
          <ToggleSetting
            icon="📄"
            label="Paper Trading Mode"
            sublabel={paperMode ? 'Simulating trades — no real execution' : 'Live trading active'}
            value={paperMode}
            onToggle={setPaperMode}
          />
          <TouchableOpacity
            style={localStyles.localeRow}
            onPress={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            activeOpacity={0.7}
          >
            <Text style={localStyles.localeIcon}>🌐</Text>
            <View style={{ flex: 1 }}>
              <Text style={localStyles.localeLabel}>Language</Text>
              <Text style={localStyles.localeSub}>{locale === 'en' ? 'English' : '中文'}</Text>
            </View>
            <Text style={localStyles.localeToggle}>{locale === 'en' ? 'Switch to 中文' : 'Switch to English'}</Text>
          </TouchableOpacity>
        </SettingsCard>

        {/* ── Account ── */}
        <SectionHeader label="Account" />
        <SettingsCard>
          <SettingRow icon="👤" label="Email"   sublabel={user?.email ?? '—'} />
          <SettingRow icon="🔑" label="User ID" sublabel={user?.id ? `${user.id.slice(0, 16)}…` : '—'} />
        </SettingsCard>

        {/* ── Sign out ── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </TouchableOpacity>

      </ScrollView>

      <PasswordConfirmModal
        visible={showPasswordModal}
        title="Enable Biometric Unlock"
        description="Enter your password to confirm your identity before enabling biometric unlock."
        onConfirm={handlePasswordConfirmed}
        onCancel={() => setShowPasswordModal(false)}
      />
    </SafeAreaView>
  )
}



const localStyles = StyleSheet.create({
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.panelBorder,
  },
  localeIcon: { fontSize: 18, marginRight: spacing[3] },
  localeLabel: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  localeSub: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginTop: 2 },
  localeToggle: {
    color: colors.gold,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
})
