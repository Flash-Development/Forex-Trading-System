import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../../stores'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import { ENV, isDev } from '../../lib/env'

type Tab = 'login' | 'register'

export function LoginScreen() {
  const { login, register } = useAuthStore()
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const reset = () => { setEmail(''); setPassword(''); setConfirmPassword(''); setError(null) }
  const switchTab = (t: Tab) => { setTab(t); reset() }

  const validate = (): string | null => {
    if (!email.trim()) return 'Email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email address'
    if (!password) return 'Password is required'
    if (password.length < 6) return 'Password must be at least 6 characters'
    if (tab === 'register' && password !== confirmPassword) return 'Passwords do not match'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setLoading(true); setError(null)
    try {
      if (tab === 'login') await login(email.trim(), password)
      else await register(email.trim(), password)
    } catch (e: any) {
      const msg: string = e.message ?? 'Something went wrong'
      if (msg.toLowerCase().includes('already initialized') || msg.toLowerCase().includes('already registered')) {
        setError('An account already exists. Please sign in instead.')
        setTab('login'); setPassword(''); setConfirmPassword('')
      } else if (msg.toLowerCase().includes('email or password')) {
        setError('Incorrect email or password.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Logo */}
          <View style={styles.logoWrap}>
            <Text style={styles.logo}>FTS</Text>
            <View style={styles.logoAccent} />
            <Text style={styles.tagline}>Flash Trading System</Text>
            {isDev && <Text style={styles.debugUrl}>⚡ {ENV.API_URL}</Text>}
          </View>

          {/* Tab switcher */}
          <View style={styles.tabs}>
            {(['login', 'register'] as Tab[]).map((t) => (
              <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => switchTab(t)}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'login' ? 'SIGN IN' : 'REGISTER'}
                </Text>
                {tab === t && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorIcon}>⚠</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={[styles.inputWrap, focusedField === 'email' && styles.inputWrapFocused]}>
              <Text style={styles.inputLabel}>EMAIL</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textDisabled}
                value={email}
                onChangeText={(v) => { setEmail(v); setError(null) }}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            <View style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textDisabled}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(null) }}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry
                editable={!loading}
              />
            </View>

            {tab === 'register' && (
              <View style={[styles.inputWrap, focusedField === 'confirm' && styles.inputWrapFocused]}>
                <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textDisabled}
                  value={confirmPassword}
                  onChangeText={(v) => { setConfirmPassword(v); setError(null) }}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry
                  editable={!loading}
                />
              </View>
            )}

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              {loading
                ? <ActivityIndicator color={colors.bg} />
                : <Text style={styles.buttonText}>{tab === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>
              }
            </TouchableOpacity>
          </View>

          {tab === 'register' && (
            <Text style={styles.note}>First-time setup only · One account per instance</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing[6] },

  logoWrap: { alignItems: 'center', marginBottom: spacing[10] },
  logo: {
    color: colors.gold,
    fontSize: 52,
    fontWeight: fontWeight.extrabold,
    fontFamily: 'monospace',
    letterSpacing: 12,
  },
  logoAccent: {
    width: 48,
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  tagline: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    letterSpacing: 3,
  },
  debugUrl: {
    color: colors.accent,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    marginTop: spacing[1],
    opacity: 0.7,
  },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.panelBorder,
    marginBottom: spacing[6],
  },
  tab: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
    position: 'relative',
  },
  tabActive: {},
  tabText: {
    color: colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
  },
  tabTextActive: { color: colors.gold },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: colors.gold,
    borderRadius: 1,
  },

  form: { gap: spacing[3] },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.redBg,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  errorIcon: { fontSize: 14 },
  errorText: { color: colors.red, fontFamily: 'monospace', fontSize: fontSize.sm, flex: 1 },

  inputWrap: {
    backgroundColor: colors.panelBg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  inputWrapFocused: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(59,130,246,0.06)',
  },
  inputLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    marginBottom: 2,
  },
  input: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: fontSize.base,
    paddingVertical: spacing[1],
  },

  button: {
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing[4],
    alignItems: 'center',
    marginTop: spacing[2],
    shadowColor: colors.goldGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.55, shadowOpacity: 0 },
  buttonText: {
    color: colors.bg,
    fontWeight: fontWeight.bold,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    letterSpacing: 3,
  },

  note: {
    color: colors.textDisabled,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing[5],
    letterSpacing: 1,
  },
})
