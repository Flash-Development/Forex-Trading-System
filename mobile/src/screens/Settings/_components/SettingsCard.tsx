import { View } from "react-native";
import styles from "../styles";

// ─── card wrapper ──────────────────────────────────────────────────────────
function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

export default SettingsCard;