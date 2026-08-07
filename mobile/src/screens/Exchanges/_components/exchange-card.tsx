import { Exchange, ExchangeAccountState } from "@/types"
import { EXCHANGE_ICONS, statusLabel, statusVariant } from "../constants"
import { styles } from "../styles"
import { Card } from "@/components/ui/Card"
import { Text, TouchableOpacity, View } from "react-native"
import { colors } from "@/theme"
import { Badge } from "@/components/ui/Badge"

// ─── exchange card ─────────────────────────────────────────────────────────
function ExchangeCard({
  exchange, state, onEdit, onDelete, onToggle,
}: {
  exchange: Exchange
  state?: ExchangeAccountState
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const icon = EXCHANGE_ICONS[exchange.exchange_type] ?? '🔗'
  return (
    <Card gold={state?.status === 'ok'} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.icon}>{icon}</Text>
          <View>
            <Text style={styles.exchangeName}>
              {exchange.account_name || exchange.name || exchange.exchange_type}
            </Text>
            <Text style={styles.exchangeType}>{exchange.exchange_type.toUpperCase()}</Text>
          </View>
        </View>
        <Badge label={statusLabel(state?.status)} variant={statusVariant(state?.status)} />
      </View>

      {/* Balance */}
      {state?.display_balance && (
        <Text style={styles.balance}>{state.display_balance}</Text>
      )}
      {state?.error_message && state.status !== 'ok' && (
        <Text style={styles.errorMsg} numberOfLines={2}>{state.error_message}</Text>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onToggle}>
          <Text style={[styles.actionText, { color: exchange.enabled ? colors.red : colors.green }]}>
            {exchange.enabled ? 'Disable' : 'Enable'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onEdit}>
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onDelete}>
          <Text style={[styles.actionText, { color: colors.red }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </Card>
  )
}

export default ExchangeCard;