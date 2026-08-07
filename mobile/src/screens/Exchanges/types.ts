import { Exchange } from "@/types"

// ─── add / edit modal ──────────────────────────────────────────────────────
export interface ModalState {
  visible: boolean
  editing?: Exchange
  type: string
  accountName: string
  enabled: boolean
  fields: Record<string, string>
  saving: boolean
  error: string | null
}