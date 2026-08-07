import { colors, radius, spacing } from "@/theme";
import { StyleSheet, View } from "react-native";

function StatCard({ children }: { children: React.ReactNode }) {
  return <View style={sc.card}>{children}</View>
}

export default StatCard;

const sc = StyleSheet.create({
  card: {
    backgroundColor: colors.panelBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    marginBottom: spacing[3],
    overflow: 'hidden',
  },
})
