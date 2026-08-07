import { useTraderStatus } from "@/hooks/useTraderData";
import styles from "../styles";
import { View } from "react-native";
import { StatRow } from "@/components/ui/StatRow";

// ─── live status row for a single trader ──────────────────────────────────
function LiveStatus({ traderId }: { traderId: string }) {
  const { data: status } = useTraderStatus(traderId)
  if (!status) return null
  return (
    <View style={styles.liveStatus}>
      <StatRow label="AI Model"   value={status.ai_model} />
      <StatRow label="Provider"   value={status.ai_provider} />
      <StatRow label="Strategy"   value={status.strategy_type === 'grid_trading' ? 'Grid' : 'AI'} />
      <StatRow label="Interval"   value={status.scan_interval} />
      <StatRow label="Cycles"     value={String(status.call_count)} />
      <StatRow label="Runtime"    value={`${status.runtime_minutes}m`} />
    </View>
  )
}

export default LiveStatus;