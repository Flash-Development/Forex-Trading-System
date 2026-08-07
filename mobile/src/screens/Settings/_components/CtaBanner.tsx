import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native"
import styles from "../styles"
import { colors } from "@/theme"

// ─── gold CTA banner (like "Set notification" in the design) ───────────────
function CtaBanner({
  icon, title, subtitle, onPress, loading,
}: {
  icon: string
  title: string
  subtitle?: string
  onPress: () => void
  loading?: boolean
}) {
  return (
    <TouchableOpacity style={styles.ctaBanner} onPress={onPress} activeOpacity={0.85} disabled={loading}>
      <View style={styles.ctaBannerText}>
        <Text style={styles.ctaBannerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.ctaBannerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.ctaBannerIcon}>
        {loading
          ? <ActivityIndicator color={colors.bg} size="small" />
          : <Text style={styles.ctaBannerIconText}>{icon}</Text>
        }
      </View>
    </TouchableOpacity>
  )
}

export default CtaBanner;