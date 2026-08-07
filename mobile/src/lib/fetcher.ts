/**
 * SWR fetcher — uses the shared httpClient so auth headers
 * and 401 handling are applied automatically.
 */
import { httpClient } from './httpClient'

export async function fetcher<T>(url: string): Promise<T> {
  const res = await httpClient.get<T>(url)
  if (!res.success) throw new Error(res.message ?? 'Fetch failed')
  return res.data!
}
