import React, { useState, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useExchanges, useExchangeStates } from '../../hooks/useTraderData.ts'
import { useAuthStore } from '../../stores'
import { exchangeApi, type CreateExchangePayload } from '../../lib/api/exchanges.ts'
import { colors } from '../../theme'
import type { Exchange } from '../../types/config'
import type { RootStackParamList } from '../../navigation/index.tsx'
import { ModalState } from './types.ts'
import { EMPTY_MODAL } from './constants.ts'
import { styles } from './styles.ts'
import ExchangeCard from './_components/exchange-card.tsx'
import ExchangeModal from './_components/exchange-modal.tsx'

// ─── main screen ───────────────────────────────────────────────────────────
export function ExchangesScreen() {
  const { token } = useAuthStore()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { data: exchanges = [], isLoading, mutate } = useExchanges(!!token)
  const { data: statesRes, mutate: mutateStates } = useExchangeStates(!!token)
  const states = statesRes?.states ?? {}

  const [modal, setModal] = useState<ModalState>(EMPTY_MODAL)

  const onRefresh = useCallback(() => { mutate(); mutateStates() }, [mutate, mutateStates])

  const openAdd = () => setModal({ ...EMPTY_MODAL, visible: true })

  const openEdit = (ex: Exchange) => setModal({
    ...EMPTY_MODAL, visible: true, editing: ex,
    type: ex.exchange_type, accountName: ex.account_name, enabled: ex.enabled,
    fields: {
      hyperliquid_wallet_addr: ex.hyperliquidWalletAddr ?? '',
      aster_user: ex.asterUser ?? '',
      aster_signer: ex.asterSigner ?? '',
      lighter_wallet_addr: ex.lighterWalletAddr ?? '',
    },
  })

  const handleToggle = useCallback(async (ex: Exchange) => {
    try {
      await exchangeApi.update(ex.id, { enabled: !ex.enabled })
      mutate()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    }
  }, [mutate])

  const handleDelete = useCallback((ex: Exchange) => {
    Alert.alert(
      `Delete "${ex.account_name || ex.exchange_type}"?`,
      'This cannot be undone. Traders using this exchange must be updated first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await exchangeApi.remove(ex.id)
              mutate()
            } catch (e: any) {
              Alert.alert('Cannot delete', e.message)
            }
          },
        },
      ]
    )
  }, [mutate])

  const handleSave = useCallback(async () => {
    setModal((m) => ({ ...m, saving: true, error: null }))
    try {
      const payload: CreateExchangePayload = {
        exchange_type: modal.type,
        account_name: modal.accountName,
        enabled: modal.enabled,
        ...Object.fromEntries(
          Object.entries(modal.fields).filter(([, v]) => v.trim() !== '')
        ) as any,
      }

      if (modal.editing) {
        await exchangeApi.update(modal.editing.id, payload)
      } else {
        await exchangeApi.create(payload)
      }
      mutate()
      mutateStates()
      setModal(EMPTY_MODAL)
    } catch (e: any) {
      setModal((m) => ({ ...m, saving: false, error: e.message }))
    }
  }, [modal, mutate, mutateStates])

  const runningCount = useMemo(
    () => Object.values(states).filter((s) => s.status === 'ok').length,
    [states]
  )

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Exchanges</Text>
            {exchanges.length > 0 && (
              <Text style={styles.subtitle}>{runningCount}/{exchanges.length} connected</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.settingsIcon}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading && exchanges.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={styles.loader} />
        ) : exchanges.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No exchanges connected</Text>
            <Text style={styles.emptyHint}>Tap "+ Add" to connect your first exchange account.</Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd}>
              <Text style={styles.emptyAddText}>+ Add Exchange</Text>
            </TouchableOpacity>
          </View>
        ) : (
          exchanges.map((ex) => (
            <ExchangeCard
              key={ex.id}
              exchange={ex}
              state={states[ex.id]}
              onEdit={() => openEdit(ex)}
              onDelete={() => handleDelete(ex)}
              onToggle={() => handleToggle(ex)}
            />
          ))
        )}
      </ScrollView>

      <ExchangeModal
        state={modal}
        onChange={(patch) => setModal((m) => ({ ...m, ...patch }))}
        onSave={handleSave}
        onClose={() => setModal(EMPTY_MODAL)}
      />
    </SafeAreaView>
  )
}

