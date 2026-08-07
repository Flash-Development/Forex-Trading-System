import { colors, fontSize, fontWeight, spacing } from "@/theme";
import { StyleSheet, Text, View } from "react-native";

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={sec.row}>
      <View style={sec.accent} />
      <Text style={sec.title}>
        {title}
        {count !== undefined && <Text style={sec.count}> ({count})</Text>}
      </Text>
    </View>
  )
}

export default SectionHeader;

const sec = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
    marginTop: spacing[3],
  },
  accent: {
    width: 3,
    height: 14,
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
  title: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  count: {
    color: colors.textTertiary,
    fontWeight: fontWeight.normal,
  },
})
