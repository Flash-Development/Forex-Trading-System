import useSWR from 'swr'
import { useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import { Activity, CircleOff, Bot } from 'lucide-react'
import type { TraderInfo } from '../../types'

export function TraderStatusPanel() {
  const { user, token } = useAuth()

  const { data: traders, mutate } = useSWR<TraderInfo[]>(
    user && token ? 'agent-sidebar-traders' : null,
    api.getTraders,
    { refreshInterval: 30000, shouldRetryOnError: false }
  )

  useEffect(() => {
    const handleRefresh = () => {
      void mutate()
    }
    window.addEventListener('agent-config-refresh', handleRefresh)
    return () => window.removeEventListener('agent-config-refresh', handleRefresh)
  }, [mutate])

  if (!user || !token) {
    return (
      <div
        style={{
          padding: '20px 14px',
          textAlign: 'center',
          color: 'var(--color-agent-muted)',
          fontSize: 12,
        }}
      >
        <Bot size={20} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
        <div>Login to view traders</div>
      </div>
    )
  }

  if (!traders || traders.length === 0) {
    return (
      <div
        style={{
          padding: '16px 14px',
          textAlign: 'center',
          color: 'var(--color-agent-muted)',
          fontSize: 12,
        }}
      >
        No traders configured
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {traders.map((trader) => (
        <div
          key={trader.trader_id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: 'var(--color-agent-dark)',
            borderRadius: 10,
            border: '1px solid #1a1a28',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: trader.is_running
                  ? 'rgba(0,229,160,0.08)'
                  : 'rgba(92,92,114,0.08)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {trader.is_running ? (
                <Activity size={14} color="var(--color-agent-green)" />
              ) : (
                <CircleOff size={14} color="var(--color-agent-muted)" />
              )}
            </div>
            <div>
              <div
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-agent-text)' }}
              >
                {trader.trader_name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-agent-muted)' }}>
                {trader.trader_id.slice(0, 8)}...
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 6,
              background: trader.is_running
                ? 'rgba(0,229,160,0.12)'
                : 'rgba(92,92,114,0.12)',
              color: trader.is_running ? 'var(--color-agent-green)' : 'var(--color-agent-muted)',
            }}
          >
            {trader.is_running ? 'RUNNING' : 'STOPPED'}
          </div>
        </div>
      ))}
    </div>
  )
}
