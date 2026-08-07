import { useSettingsStore } from '../stores/settingsStore'
import { colors as darkColors } from '../theme/colors'
import type { ColorKey } from '../theme/colors'

// Light theme overrides — only what differs from dark
const lightOverrides = {
  bg: '#F0F2F5',
  bgDeeper: '#E4E7EB',
  bgLighter: '#FFFFFF',
  bgSecondary: '#F8FAFC',
  glass: 'rgba(255,255,255,0.85)',
  glassBorder: '#D1D5DB',
  panelBg: 'rgba(255,255,255,0.9)',
  panelBorder: '#E5E7EB',
  tabBar: '#FFFFFF',
  tabBarBorder: 'rgba(59,130,246,0.2)',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textTertiary: '#6B7280',
  textDisabled: '#9CA3AF',
}

export function useThemeColors() {
  const theme = useSettingsStore((s) => s.theme)
  if (theme === 'light') {
    return { ...darkColors, ...lightOverrides }
  }
  return darkColors
}

export function useLocale() {
  return useSettingsStore((s) => s.locale)
}
