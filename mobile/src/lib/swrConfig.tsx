import React from 'react'
import { SWRConfig } from 'swr'
import { fetcher } from './fetcher'

interface Props { children: React.ReactNode }

export function SWRProvider({ children }: Props) {
  return (
    <SWRConfig
      value={{
        fetcher,
        refreshInterval: 30_000,      // poll every 30s — reduces background polling load
        revalidateOnFocus: false,     // prevent refetch on app-switch
        revalidateOnReconnect: true,
        shouldRetryOnError: false,    // let the 401 handler deal with auth errors
        dedupingInterval: 10_000,     // reduce redundant network requests
      }}
    >
      {children}
    </SWRConfig>
  )
}
