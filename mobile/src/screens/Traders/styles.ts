import { colors, fontSize, fontWeight, radius, spacing } from "@/theme";
import { StyleSheet } from "react-native";

// ─── styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10] },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4] },
  title: { color: colors.gold, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace', letterSpacing: 1 },
  summary: { backgroundColor: colors.panelBg, borderRadius: radius.full, paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderWidth: 1, borderColor: colors.panelBorder },
  summaryText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs },

  card: { marginBottom: spacing[3] },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[1] },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },

  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLive: { backgroundColor: colors.green },
  dotStopped: { backgroundColor: colors.textDisabled },

  name: { color: colors.textPrimary, fontSize: fontSize.md, fontFamily: 'monospace', fontWeight: '600' },
  nameActive: { color: colors.gold },
  meta: { color: colors.textTertiary, fontSize: fontSize.xs, fontFamily: 'monospace', letterSpacing: 1, marginBottom: spacing[3] },
  expandIcon: { color: colors.textTertiary, fontSize: fontSize.xs },

  liveStatus: {
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    paddingTop: spacing[3],
    marginBottom: spacing[3],
  },

  ctaBtn: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    marginTop: spacing[1],
  },
  ctaBtnStart: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
    shadowColor: colors.goldGlow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaBtnStop: { backgroundColor: colors.redBg, borderColor: colors.redBorder },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaText: { fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: fontWeight.bold, letterSpacing: 2 },
  ctaTextStart: { color: colors.bg },
  ctaTextStop: { color: colors.red },

  loader: { marginTop: spacing[10] },
  emptyState: { alignItems: 'center', marginTop: spacing[10], paddingHorizontal: spacing[6] },
  emptyTitle: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.md, marginBottom: spacing[2] },
  emptyHint: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, textAlign: 'center', lineHeight: 18 },
})

export default styles;