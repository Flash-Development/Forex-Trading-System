import { colors, fontSize, fontWeight, radius, spacing } from "@/theme";
import { StyleSheet } from "react-native";

 const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[12] },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  screenTitle: { flex: 1, color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  headerBtn: { padding: spacing[1] },

  loader: { marginTop: spacing[10] },

  chartHeader: { paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  sectionLabel: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, letterSpacing: 2, marginBottom: spacing[2] },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.panelBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    padding: spacing[3],
  },
  summaryLabel: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginBottom: spacing[1] },
  summaryValue: { color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.md, fontWeight: fontWeight.bold },

  emptyState: { alignItems: 'center', marginTop: spacing[16], paddingHorizontal: spacing[6] },
  emptyTitle: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing[2] },
  emptyHint: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
})

export default styles;