import React, { useState } from "react"
import styles from "../styles"
import { Card } from "@/components/ui/Card"
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native"
import LiveDot from "./LiveDot"
import { TraderInfo } from "@/types"
import { Badge } from "@/components/ui/Badge"
import LiveStatus from "./LiveStatus"
import { colors } from "@/theme"


// ─── single trader card ────────────────────────────────────────────────────
interface TraderCardProps {
  trader: TraderInfo
  isSelected: boolean
  onSelect: () => void
  onToggle: () => void
  toggling: boolean
}
 
const TraderCard = React.memo(function TraderCard({ trader, isSelected, onSelect, onToggle, toggling }: TraderCardProps) {
  const [expanded, setExpanded] = useState(false)

  const handleExpand = () => {
    onSelect()
    setExpanded((v) => !v)
  }

  return (
    <Card gold={isSelected} style={styles.card}>
      {/* Header — tap to expand */}
      <TouchableOpacity onPress={handleExpand} activeOpacity={0.8}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <LiveDot running={trader.is_running} />
            <Text style={[styles.name, isSelected && styles.nameActive]}>
              {trader.trader_name}
            </Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <Badge
              label={trader.is_running ? '● LIVE' : '○ STOPPED'}
              variant={trader.is_running ? 'success' : 'muted'}
            />
            <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {trader.strategy_type?.replace('_', ' ').toUpperCase() ?? 'AI TRADING'}
        </Text>
      </TouchableOpacity>

      {/* Live status detail — only when expanded */}
      {expanded && <LiveStatus traderId={trader.trader_id} />}

      {/* Start / Stop button */}
      <TouchableOpacity
        style={[
          styles.ctaBtn,
          trader.is_running ? styles.ctaBtnStop : styles.ctaBtnStart,
          toggling && styles.ctaBtnDisabled,
        ]}
        onPress={onToggle}
        disabled={toggling}
        activeOpacity={0.75}
      >
        {toggling ? (
          <ActivityIndicator color={trader.is_running ? colors.red : colors.bg} size="small" />
        ) : (
          <Text style={[styles.ctaText, trader.is_running ? styles.ctaTextStop : styles.ctaTextStart]}>
            {trader.is_running ? '■  STOP TRADER' : '▶  START TRADER'}
          </Text>
        )}
      </TouchableOpacity>
    </Card>
  )
})

export default TraderCard;