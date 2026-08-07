/**
 * CreateTraderWizard — full-screen 3-step wizard for creating a new trader.
 * Design: top progress bar, large bold step title, BACK/NEXT split footer.
 */
import React, { useState, useCallback } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  StatusBar,
} from 'react-native'
import useSWR from 'swr'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fontSize, fontWeight, spacing, radius } from '../theme'
import { API_BASE } from '../lib/httpClient'
import { traderApi, type CreateTraderPayload } from '../lib/api/traders'

// ─── types ──────────────────────────────────────────────────────────────────
interface WizardState {
  name: string
  exchangeId: string
  modelId: string
  strategyId: string
  scanInterval: string
}

const EMPTY: WizardState = {
  name: '',
  exchangeId: '',
  modelId: '',
  strategyId: '',
  scanInterval: '5',
}

// Exchange types supported for AI trader creation
const SUPPORTED_EXCHANGE_TYPES = new Set([
  'binance', 'bybit', 'okx', 'bitget', 'gate', 'kucoin',
  'hyperliquid', 'aster', 'lighter', 'indodax', 'mt5',
])

const EXCHANGE_ICONS: Record<string, string> = {
  binance: 'B',
  bybit: 'BY',
  okx: 'OKX',
  bitget: 'BG',
  gate: 'GT',
  kucoin: 'KC',
  hyperliquid: 'HL',
  aster: 'AS',
  lighter: 'LT',
  indodax: 'ID',
  mt5: 'MT',
}

const PROVIDER_ICONS: Record<string, string> = {
  openai: 'AI',
  deepseek: 'DS',
  claude: 'CL',
  gemini: 'GM',
  grok: 'GK',
  kimi: 'KM',
  qwen: 'QW',
  minimax: 'MM',
}

const STEPS = [
  {
    title: 'NAME YOUR\nTRADER',
    subtitle: 'Give your trader a name and pick the exchange account it will trade on.',
  },
  {
    title: 'CHOOSE AN\nAI MODEL',
    subtitle: 'Select the AI brain that will analyse the market and make trading decisions.',
  },
  {
    title: 'SELECT A\nSTRATEGY',
    subtitle: 'Pick a trading strategy and set how often the AI should scan the market.',
  },
]

// ─── translate backend error messages to English ─────────────────────────────
function translateError(msg: string): string {
  if (!msg) return 'An unexpected error occurred.'

  const translations: Array<[RegExp, string]> = [
    [/AI 模型.*不存在|找不到.*AI 模型|没有找到你选择的 AI 模型/, 'The selected AI model was not found. Please add one in Settings first.'],
    [/AI 模型.*没有.*启用|AI 模型.*未启用/, 'The selected AI model is not enabled. Please enable it in Settings.'],
    [/AI 模型.*缺少.*API Key|API Key.*支付凭证/, 'The selected AI model is missing an API key. Please add credentials in Settings.'],
    [/交易所账户.*不存在|没有找到你选择的交易所/, 'The selected exchange account was not found.'],
    [/交易所账户.*未启用|交易所.*未启用/, 'The selected exchange account is not enabled.'],
    [/交易所账户.*配置.*不完整|缺少/, 'The exchange account configuration is incomplete. Please check your credentials.'],
    [/交易所.*不支持|暂不支持的类型|unsupported trading platform/, 'This exchange type is not supported for AI trading. Please select a different exchange.'],
    [/交易所账户.*没有通过初始化校验|初始化校验/, 'The exchange account failed validation. Please check your API keys and wallet address.'],
    [/策略.*不存在|你选择的策略不存在/, 'The selected strategy was not found.'],
    [/还没有选择交易策略|没有选择.*策略/, 'Please select a trading strategy.'],
    [/名称.*不完整|格式不正确|提交的信息不完整/, 'The request is incomplete or invalid. Please check all fields.'],
    [/BTC.*ETH.*杠杆/, 'BTC/ETH leverage must be between 1 and 50.'],
    [/山寨币.*杠杆/, 'Altcoin leverage must be between 1 and 20.'],
    [/交易对.*格式不正确/, 'Invalid trading pair format. Only USD-margined pairs are supported.'],
    [/机器人.*没有保存成功|配置没有保存/, 'Failed to save the trader. Please check your configuration and try again.'],
    [/机器人.*初始化.*没有成功|没有成功启动/, 'The trader was saved but failed to initialise. Check your model, strategy, and exchange settings.'],
    [/暂时无法读取|暂时无法连接|请稍后重试/, 'A temporary server error occurred. Please try again.'],
    [/私钥格式不正确/, 'The private key format is invalid.'],
    [/Hyperliquid.*初始化失败/, 'Hyperliquid account initialisation failed. Check your private key and wallet address.'],
    [/Aster.*初始化失败/, 'Aster account initialisation failed. Check your credentials.'],
    [/Agent Wallet.*余额过高/, 'Hyperliquid Agent Wallet balance is too high for the current security policy.'],
    [/无法从交易所读取账户余额/, 'Unable to fetch account balance from the exchange.'],
  ]

  for (const [pattern, english] of translations) {
    if (pattern.test(msg)) return english
  }

  // Pass through if no Chinese characters
  if (!/[\u4e00-\u9fff]/.test(msg)) return msg

  return 'Failed to create trader. Please check your configuration and try again.'
}

// ─── progress bar ────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.progressTrack}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressSegment,
            i < current && styles.progressDone,
            i === current && styles.progressActive,
          ]}
        />
      ))}
    </View>
  )
}

function StepPill({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.stepPill}>
      <Text style={styles.stepPillText}>{current + 1}/{total}</Text>
    </View>
  )
}

// ─── selectable row ──────────────────────────────────────────────────────────
function SelectRow({
  icon, title, subtitle, selected, onPress,
}: {
  icon: string
  title: string
  subtitle?: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.rowActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.rowIconWrap, selected && styles.rowIconWrapActive]}>
        <Text style={styles.rowIconText}>{icon}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, selected && styles.rowTitleActive]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.rowCheck, selected && styles.rowCheckActive]}>
        {selected && <Text style={styles.rowCheckMark}>v</Text>}
      </View>
    </TouchableOpacity>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <View style={styles.emptyHint}>
      <Text style={styles.emptyHintText}>{text}</Text>
    </View>
  )
}

// ─── main wizard ─────────────────────────────────────────────────────────────
interface Props {
  visible: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateTraderWizard({ visible, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<WizardState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: rawExchanges } = useSWR<unknown>(visible ? `${API_BASE}/exchanges` : null)
  const { data: rawModels }    = useSWR<unknown>(visible ? `${API_BASE}/models` : null)
  const { data: rawStrategies } = useSWR<unknown>(visible ? `${API_BASE}/strategies` : null)

  const toArray = (v: unknown): any[] => {
    if (!v) return []
    if (Array.isArray(v)) return v
    const obj = v as Record<string, unknown>
    if (Array.isArray(obj.data)) return obj.data as any[]
    if (Array.isArray(obj.strategies)) return obj.strategies as any[]
    if (Array.isArray(obj.models)) return obj.models as any[]
    if (Array.isArray(obj.exchanges)) return obj.exchanges as any[]
    return []
  }

  const allExchanges = toArray(rawExchanges)
  const allModels    = toArray(rawModels)
  const strategies   = toArray(rawStrategies)

  // Only show exchanges that are enabled AND supported for AI trading
  const activeExchanges = allExchanges.filter(
    (e: any) => e.enabled && SUPPORTED_EXCHANGE_TYPES.has(e.exchange_type)
  )
  const activeModels = allModels.filter((m: any) => m.enabled)

  // Clear stale exchangeId if it's no longer in the supported list
  React.useEffect(() => {
    if (form.exchangeId && !activeExchanges.find((e: any) => e.id === form.exchangeId)) {
      patch({ exchangeId: '' })
    }
  }, [activeExchanges.length])

  const reset = () => { setStep(0); setForm(EMPTY); setError(null); setSaving(false) }
  const handleClose = () => { reset(); onClose() }
  const patch = (p: Partial<WizardState>) => setForm((f) => ({ ...f, ...p }))

  const canNext = useCallback(() => {
    if (step === 0) return form.name.trim().length > 0 && form.exchangeId !== ''
    if (step === 1) return form.modelId !== ''
    if (step === 2) return form.strategyId !== ''
    return false
  }, [step, form])

  const handleNext = async () => {
    setError(null)
    if (step < 2) { setStep((s) => s + 1); return }
    setSaving(true)
    try {
      const payload: CreateTraderPayload = {
        name: form.name.trim(),
        exchange_id: form.exchangeId,
        ai_model_id: form.modelId,
        strategy_id: form.strategyId,
        scan_interval_minutes: Math.max(3, parseInt(form.scanInterval, 10) || 5),
      }
      await traderApi.createTrader(payload)
      reset()
      onCreated()
    } catch (e: any) {
      setError(translateError(e.message ?? ''))
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <SafeAreaView style={styles.safe}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={step === 0 ? handleClose : () => { setStep((s) => s - 1); setError(null) }}
            style={styles.topBarBack}
          >
            <Text style={styles.topBarChevron}>{'<'}</Text>
            <Text style={styles.topBarBackLabel}>{step === 0 ? 'CANCEL' : 'BACK'}</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>NEW TRADER</Text>
          <StepPill current={step} total={3} />
        </View>

        {/* Progress bar */}
        <ProgressBar current={step} total={3} />

        {/* Step heading */}
        <View style={styles.heading}>
          <Text style={styles.headingTitle}>{STEPS[step].title}</Text>
          <Text style={styles.headingSubtitle}>{STEPS[step].subtitle}</Text>
        </View>

        {/* Content */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === 0 && (
              <>
                <Text style={styles.fieldLabel}>Trader Name</Text>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => patch({ name: v })}
                  placeholder="e.g. BTC Scalper"
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                  returnKeyType="next"
                />
                <Text style={[styles.fieldLabel, { marginTop: spacing[5] }]}>Exchange Account</Text>
                {activeExchanges.length === 0 ? (
                  allExchanges.filter((e: any) => e.enabled).length > 0 ? (
                    <EmptyHint text="No supported exchange accounts found. Add a supported exchange (Binance, Bybit, MT5, OKX, etc.) in the Exchanges tab." />
                  ) : (
                    <EmptyHint text="No enabled exchanges found. Add an exchange account in the Exchanges tab first." />
                  )
                ) : (
                  activeExchanges.map((ex: any) => (
                    <SelectRow
                      key={ex.id}
                      icon={EXCHANGE_ICONS[ex.exchange_type] ?? ex.exchange_type.slice(0, 3).toUpperCase()}
                      title={ex.account_name || ex.name || ex.exchange_type}
                      subtitle={ex.exchange_type.toUpperCase()}
                      selected={form.exchangeId === ex.id}
                      onPress={() => patch({ exchangeId: ex.id })}
                    />
                  ))
                )}
              </>
            )}

            {step === 1 && (
              activeModels.length === 0
                ? <EmptyHint text="No enabled AI models. Add one in Settings first." />
                : activeModels.map((m: any) => (
                    <SelectRow
                      key={m.id}
                      icon={PROVIDER_ICONS[m.provider] ?? m.provider.slice(0, 2).toUpperCase()}
                      title={m.name}
                      subtitle={m.provider.toUpperCase()}
                      selected={form.modelId === m.id}
                      onPress={() => patch({ modelId: m.id })}
                    />
                  ))
            )}

            {step === 2 && (
              <>
                {strategies.length === 0
                  ? <EmptyHint text="No strategies found. Create one in the web dashboard first." />
                  : strategies.map((s: any) => (
                      <SelectRow
                        key={s.id}
                        icon={s.is_active ? '*' : '-'}
                        title={s.name}
                        subtitle={s.is_active ? 'Active strategy' : s.is_default ? 'Default' : undefined}
                        selected={form.strategyId === s.id}
                        onPress={() => patch({ strategyId: s.id })}
                      />
                    ))
                }
                <Text style={[styles.fieldLabel, { marginTop: spacing[5] }]}>Scan Interval (minutes)</Text>
                <TextInput
                  style={styles.input}
                  value={form.scanInterval}
                  onChangeText={(v) => patch({ scanInterval: v.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  placeholder="5"
                  placeholderTextColor={colors.textTertiary}
                />
                <Text style={styles.inputHint}>Minimum 3 min. Lower = more AI calls = higher cost.</Text>
              </>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerBack}
            onPress={step === 0 ? handleClose : () => { setStep((s) => s - 1); setError(null) }}
          >
            <Text style={styles.footerBackText}>{step === 0 ? 'CANCEL' : 'BACK'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerNext, (!canNext() || saving) && styles.footerNextDisabled]}
            onPress={handleNext}
            disabled={!canNext() || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={colors.bg} />
              : <Text style={styles.footerNextText}>{step < 2 ? 'NEXT' : 'CREATE'}</Text>
            }
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </Modal>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  topBarBack: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 70 },
  topBarChevron: { color: colors.gold, fontSize: 22, fontFamily: 'monospace', fontWeight: fontWeight.bold },
  topBarBackLabel: { color: colors.gold, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold, letterSpacing: 1 },
  topBarTitle: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold, letterSpacing: 3 },

  stepPill: {
    backgroundColor: colors.bgLighter,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderWidth: 1,
    borderColor: colors.glassBorder,
    minWidth: 70,
    alignItems: 'flex-end',
  },
  stepPillText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold },

  progressTrack: {
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: spacing[4],
    marginBottom: spacing[5],
  },
  progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.bgLighter },
  progressActive: { backgroundColor: colors.gold },
  progressDone: { backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.gold },

  heading: { paddingHorizontal: spacing[5], marginBottom: spacing[5] },
  headingTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
    fontFamily: 'monospace',
    letterSpacing: 1,
    lineHeight: 34,
    marginBottom: spacing[2],
  },
  headingSubtitle: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.sm, lineHeight: 20 },

  scrollContent: { paddingHorizontal: spacing[5], paddingBottom: spacing[6] },

  fieldLabel: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing[2],
  },
  input: {
    backgroundColor: colors.bgLighter,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    borderRadius: radius.md,
    padding: spacing[4],
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: fontSize.base,
  },
  inputHint: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginTop: spacing[1] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgLighter,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing[3],
    marginBottom: spacing[2],
  },
  rowActive: { borderColor: colors.gold, backgroundColor: 'rgba(240,185,11,0.06)' },
  rowIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing[3],
  },
  rowIconWrapActive: { backgroundColor: colors.goldDim },
  rowIconText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  rowTitleActive: { color: colors.gold },
  rowSub: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginTop: 2 },
  rowCheck: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: colors.panelBorder,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing[2],
  },
  rowCheckActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  rowCheckMark: { color: colors.bg, fontSize: 13, fontWeight: fontWeight.bold },

  emptyHint: {
    backgroundColor: colors.bgLighter,
    borderRadius: radius.md,
    padding: spacing[5],
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
  },
  emptyHintText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },

  errorBox: {
    backgroundColor: colors.redBg,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: radius.md,
    padding: spacing[3],
    marginTop: spacing[3],
  },
  errorText: { color: colors.red, fontFamily: 'monospace', fontSize: fontSize.xs, lineHeight: 18 },

  footer: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  footerBack: {
    flex: 1,
    backgroundColor: colors.bgLighter,
    borderRadius: radius.lg,
    padding: spacing[4],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  footerBackText: { color: colors.textSecondary, fontFamily: 'monospace', fontWeight: fontWeight.bold, fontSize: fontSize.sm, letterSpacing: 2 },
  footerNext: {
    flex: 2,
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing[4],
    alignItems: 'center',
  },
  footerNextDisabled: { opacity: 0.4 },
  footerNextText: { color: colors.bg, fontFamily: 'monospace', fontWeight: fontWeight.bold, fontSize: fontSize.sm, letterSpacing: 2 },
})
