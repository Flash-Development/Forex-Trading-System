/**
 * PasswordConfirmModal — prompts the user to enter their current password
 * before a sensitive action (e.g. enabling biometric login).
 */
import React, { useState } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { colors, fontSize, fontWeight, spacing, radius } from '../theme'

interface Props {
  visible: boolean
  title?: string
  description?: string
  onConfirm: (password: string) => Promise<void>
  onCancel: () => void
}

export function PasswordConfirmModal({
  visible,
  title = 'Confirm Password',
  description = 'Enter your password to continue.',
  onConfirm,
  onCancel,
}: Props) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    if (!password) { setError('Password is required'); return }
    setLoading(true)
    setError(null)
    try {
      await onConfirm(password)
      setPassword('')
    } catch (e: any) {
      setError(e.message ?? 'Incorrect password.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setPassword('')
    setError(null)
    onCancel()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Password"
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={(v) => { setPassword(v); setError(null) }}
            secureTextEntry
            autoFocus
            editable={!loading}
            onSubmitEditing={handleConfirm}
            returnKeyType="done"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={loading || !password}
            >
              {loading
                ? <ActivityIndicator color={colors.bg} size="small" />
                : <Text style={styles.confirmText}>Confirm</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing[6],
  },
  sheet: {
    backgroundColor: colors.bgLighter,
    borderRadius: radius.lg,
    padding: spacing[6],
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  title: {
    color: colors.gold,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.lg,
    marginBottom: spacing[2],
  },
  description: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing[4],
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    borderRadius: radius.md,
    padding: spacing[3],
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: fontSize.base,
    marginBottom: spacing[2],
  },
  inputError: {
    borderColor: colors.red,
  },
  error: {
    color: colors.red,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    marginBottom: spacing[3],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    borderRadius: radius.md,
    padding: spacing[3],
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing[3],
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: {
    color: colors.bg,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
})
