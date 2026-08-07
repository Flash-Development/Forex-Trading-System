import { Text, View } from "react-native"
import styles from "../styles"


// ─── setting row with icon, label, and right element ──────────────────────
function SettingRow({
  icon, label, sublabel, right,
}: {
  icon: string
  label: string
  sublabel?: string
  right?: React.ReactNode
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Text style={styles.settingIconText}>{icon}</Text>
      </View>
      <View style={styles.settingBody}>
        <Text style={styles.settingLabel}>{label}</Text>
        {sublabel ? <Text style={styles.settingSubLabel}>{sublabel}</Text> : null}
      </View>
      {right ? <View style={styles.settingRight}>{right}</View> : null}
    </View>
  )
}

export default SettingRow;