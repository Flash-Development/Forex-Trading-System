import { Text } from "react-native";
import styles from "../styles";

// ─── section header ────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label}</Text>
}

export default SectionHeader;