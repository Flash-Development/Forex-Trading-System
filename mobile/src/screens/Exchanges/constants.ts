import { CreateExchangePayload } from "@/lib/api/exchanges";
import { ModalState } from "./types";

// ─── exchange metadata ─────────────────────────────────────────────────────
export const EXCHANGE_ICONS: Record<string, string> = {
  binance: '🟡', bybit: '🟠', okx: '⚫', bitget: '🔵',
  gate: '🟢', kucoin: '🔴', indodax: '🇮🇩', mt5: '📊',
  hyperliquid: '🌊', aster: '⭐', lighter: '⚡',
}

export type FieldDef = { key: keyof CreateExchangePayload; label: string; secret?: boolean; placeholder?: string }

export const EXCHANGE_FIELDS: Record<string, FieldDef[]> = {
  binance:     [{ key: 'api_key', label: 'API Key', secret: true }, { key: 'secret_key', label: 'Secret Key', secret: true }],
  bybit:       [{ key: 'api_key', label: 'API Key', secret: true }, { key: 'secret_key', label: 'Secret Key', secret: true }],
  okx:         [{ key: 'api_key', label: 'API Key', secret: true }, { key: 'secret_key', label: 'Secret Key', secret: true }, { key: 'passphrase', label: 'Passphrase', secret: true }],
  bitget:      [{ key: 'api_key', label: 'API Key', secret: true }, { key: 'secret_key', label: 'Secret Key', secret: true }, { key: 'passphrase', label: 'Passphrase', secret: true }],
  gate:        [{ key: 'api_key', label: 'API Key', secret: true }, { key: 'secret_key', label: 'Secret Key', secret: true }],
  kucoin:      [{ key: 'api_key', label: 'API Key', secret: true }, { key: 'secret_key', label: 'Secret Key', secret: true }, { key: 'passphrase', label: 'Passphrase', secret: true }],
  indodax:     [{ key: 'api_key', label: 'API Key', secret: true }, { key: 'secret_key', label: 'Secret Key', secret: true }],
  mt5:         [{ key: 'api_key', label: 'Bridge URL', placeholder: 'http://localhost:8001' }],
  hyperliquid: [{ key: 'api_key', label: 'Private Key', secret: true }, { key: 'hyperliquid_wallet_addr', label: 'Wallet Address' }],
  aster:       [{ key: 'aster_user', label: 'Aster User' }, { key: 'aster_signer', label: 'Aster Signer' }, { key: 'aster_private_key', label: 'Private Key', secret: true }],
  lighter:     [{ key: 'lighter_wallet_addr', label: 'Wallet Address' }, { key: 'lighter_api_key_private_key', label: 'API Key Private Key', secret: true }],
}

export const SUPPORTED_TYPES = Object.keys(EXCHANGE_FIELDS)

// ─── status badge ──────────────────────────────────────────────────────────
export function statusVariant(status?: string): 'success' | 'danger' | 'muted' | 'gold' {
  switch (status) {
    case 'ok':                   return 'success'
    case 'invalid_credentials':
    case 'permission_denied':    return 'danger'
    case 'missing_credentials':  return 'gold'
    default:                     return 'muted'
  }
}

export function statusLabel(status?: string): string {
  const map: Record<string, string> = {
    ok: 'CONNECTED', disabled: 'DISABLED',
    missing_credentials: 'NO KEYS', invalid_credentials: 'INVALID',
    permission_denied: 'DENIED', unavailable: 'OFFLINE',
  }
  return map[status ?? ''] ?? 'UNKNOWN'
}

export const EMPTY_MODAL: ModalState = {
  visible: false, editing: undefined, type: 'binance',
  accountName: '', enabled: true, fields: {}, saving: false, error: null,
}