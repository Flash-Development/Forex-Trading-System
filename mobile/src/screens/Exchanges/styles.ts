import { colors, fontSize, fontWeight, radius, spacing } from "@/theme";
import { StyleSheet } from "react-native";

// ─── styles ────────────────────────────────────────────────────────────────
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[4], paddingBottom: spacing[10] },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing[4] },
  title: { color: colors.gold, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, fontFamily: 'monospace', letterSpacing: 1 },
  subtitle: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  addBtn: { backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  addBtnText: { color: colors.gold, fontFamily: 'monospace', fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  settingsBtn: { padding: spacing[2] },
  settingsIcon: { fontSize: 20, color: colors.textSecondary },

  card: { marginBottom: spacing[3] },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[2] },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  icon: { fontSize: 24 },
  exchangeName: { color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.md, fontWeight: '600' },
  exchangeType: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, letterSpacing: 1 },
  balance: { color: colors.green, fontFamily: 'monospace', fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing[2] },
  errorMsg: { color: colors.red, fontFamily: 'monospace', fontSize: fontSize.xs, marginBottom: spacing[2] },

  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing[2], marginTop: spacing[1] },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing[1] },
  actionText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs, fontWeight: fontWeight.medium },

  loader: { marginTop: spacing[10] },
  emptyState: { alignItems: 'center', marginTop: spacing[10], paddingHorizontal: spacing[6] },
  emptyTitle: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.md, marginBottom: spacing[2] },
  emptyHint: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs, textAlign: 'center', lineHeight: 18, marginBottom: spacing[4] },
  emptyAddBtn: { backgroundColor: colors.gold, borderRadius: radius.md, paddingHorizontal: spacing[6], paddingVertical: spacing[3] },
  emptyAddText: { color: colors.bg, fontFamily: 'monospace', fontWeight: fontWeight.bold, fontSize: fontSize.sm, letterSpacing: 1 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: colors.bgLighter, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing[5], maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4] },
  modalTitle: { color: colors.gold, fontFamily: 'monospace', fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  modalClose: { color: colors.textTertiary, fontSize: fontSize.lg, padding: spacing[1] },

  field: { marginBottom: spacing[3] },
  fieldLabel: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.xs, letterSpacing: 1, marginBottom: spacing[1] },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radius.md, padding: spacing[3], color: colors.textPrimary, fontFamily: 'monospace', fontSize: fontSize.sm },

  typePicker: { marginTop: spacing[1] },
  typePill: { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.full, borderWidth: 1, borderColor: colors.panelBorder, marginRight: spacing[2] },
  typePillActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  typePillText: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: fontSize.xs },
  typePillTextActive: { color: colors.gold },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4] },

  errorBox: { backgroundColor: colors.redBg, borderWidth: 1, borderColor: colors.redBorder, borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3] },
  errorBoxText: { color: colors.red, fontFamily: 'monospace', fontSize: fontSize.sm },

  saveBtn: { backgroundColor: colors.gold, borderRadius: radius.md, padding: spacing[4], alignItems: 'center', marginBottom: spacing[4] },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.bg, fontFamily: 'monospace', fontWeight: fontWeight.bold, fontSize: fontSize.sm, letterSpacing: 2 },
})
