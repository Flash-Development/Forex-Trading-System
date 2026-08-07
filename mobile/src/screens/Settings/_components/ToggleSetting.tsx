import { Switch } from "react-native"
import SettingRow from "./SettingRow"
import { colors } from "@/theme"

// ─── toggle setting row ────────────────────────────────────────────────────
function ToggleSetting({
  icon, label, sublabel, value, onToggle,
}: {
  icon: string
  label: string
  sublabel?: string
  value: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <SettingRow
      icon={icon}
      label={label}
      sublabel={sublabel}
      right={
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.bgLighter, true: colors.gold }}
          thumbColor={colors.bg}
          ios_backgroundColor={colors.bgLighter}
        />
      }
    />
  )
}

export default ToggleSetting;