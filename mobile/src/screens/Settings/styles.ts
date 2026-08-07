import { colors, fontSize, fontWeight, radius, spacing } from "@/theme";
import { StyleSheet } from "react-native";

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[12] },

  // ── Profile header ──
  profileHeader: {
    alignItems: 'center',
    paddingTop: spacing[6],
    paddingBottom: spacing[6],
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.goldDim,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  avatarText: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: fontWeight.bold,
    fontFamily: 'monospace',
  },
  profileEmail: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    fontFamily: 'monospace',
    marginBottom: spacing[1],
  },
  profileMeta: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
  },

  // ── Section header ──
  sectionHeader: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing[5],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[1],
  },

  // ── Card ──
  card: {
    backgroundColor: colors.panelBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    overflow: 'hidden',
  },

  // ── Setting row ──
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  settingIconText: { fontSize: 16 },
  settingBody: { flex: 1 },
  settingLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    fontWeight: fontWeight.medium,
  },
  settingSubLabel: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  settingRight: { marginLeft: spacing[2] },

  subAction: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  subActionText: {
    color: colors.gold,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },

  // ── Gold CTA banner ──
  ctaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    marginBottom: spacing[1],
  },
  ctaBannerText: { flex: 1 },
  ctaBannerTitle: {
    color: colors.bg,
    fontSize: fontSize.base,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
  },
  ctaBannerSubtitle: {
    color: 'rgba(5,7,10,0.65)',
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  ctaBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing[3],
  },
  ctaBannerIconText: { fontSize: 18 },

  // ── Inputs ──
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing[3],
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    margin: spacing[3],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  saveBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing[3],
    alignItems: 'center',
    margin: spacing[3],
    marginTop: 0,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    color: colors.bg,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.xs,
    letterSpacing: 2,
  },

  // ── Sign out ──
  logoutBtn: {
    marginTop: spacing[6],
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: radius.lg,
    padding: spacing[4],
    alignItems: 'center',
  },
  logoutText: {
    color: colors.red,
    fontFamily: 'monospace',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
    letterSpacing: 2,
  },
})

export default styles;