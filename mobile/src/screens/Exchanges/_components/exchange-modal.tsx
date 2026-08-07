import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native"
import { EXCHANGE_FIELDS, EXCHANGE_ICONS, SUPPORTED_TYPES } from "../constants"
import { ModalState } from "../types"
import { styles } from "../styles"
import { colors } from "@/theme"

function ExchangeModal({
  state, onChange, onSave, onClose,
}: {
  state: ModalState
  onChange: (patch: Partial<ModalState>) => void
  onSave: () => void
  onClose: () => void
}) {
  const fieldDefs = EXCHANGE_FIELDS[state.type] ?? []
  const isEdit = !!state.editing

  return (
    <Modal visible={state.visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEdit ? 'Edit Exchange' : 'Add Exchange'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Exchange type picker (add only) */}
            {!isEdit && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Exchange Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typePicker}>
                  {SUPPORTED_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typePill, state.type === t && styles.typePillActive]}
                      onPress={() => onChange({ type: t, fields: {} })}
                    >
                      <Text style={[styles.typePillText, state.type === t && styles.typePillTextActive]}>
                        {EXCHANGE_ICONS[t]} {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Account name */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Account Name</Text>
              <TextInput
                style={styles.input}
                value={state.accountName}
                onChangeText={(v) => onChange({ accountName: v })}
                placeholder="e.g. Main Account"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            {/* Dynamic credential fields */}
            {fieldDefs.map((f) => (
              <View key={f.key} style={styles.field}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  value={state.fields[f.key] ?? ''}
                  onChangeText={(v) => onChange({ fields: { ...state.fields, [f.key]: v } })}
                  placeholder={f.placeholder ?? (f.secret ? '••••••••' : '')}
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry={f.secret}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ))}

            {/* Enabled toggle */}
            <View style={styles.toggleRow}>
              <Text style={styles.fieldLabel}>Enabled</Text>
              <Switch
                value={state.enabled}
                onValueChange={(v) => onChange({ enabled: v })}
                trackColor={{ false: colors.bgLighter, true: colors.goldDim }}
                thumbColor={state.enabled ? colors.gold : colors.textTertiary}
              />
            </View>

            {state.error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorBoxText}>{state.error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, state.saving && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={state.saving}
            >
              {state.saving
                ? <ActivityIndicator color={colors.bg} />
                : <Text style={styles.saveBtnText}>{isEdit ? 'SAVE CHANGES' : 'ADD EXCHANGE'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}


export default ExchangeModal;