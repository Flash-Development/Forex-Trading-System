import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { secureStorage, STORAGE_KEYS } from './secureStorage'
import { ENV, isProd, validateEnv } from './env'

// Lazily resolve Sentry to avoid hard dependency before initSentry() is called.
// When @sentry/react-native is not yet installed this import will be undefined.
let Sentry: { captureException: (err: unknown, ctx?: object) => void } | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require('@sentry/react-native')
} catch {
  // Sentry not installed — captureException calls will be no-ops
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  errorKey?: string
  statusCode?: number
}

export const API_BASE_URL = ENV.API_URL
export const API_BASE = `${API_BASE_URL}/api`

// Callback set by authStore to handle 401 globally
let on401: (() => void) | null = null
export function register401Handler(handler: () => void) {
  on401 = handler
}

class HttpClient {
  private instance: AxiosInstance

  constructor() {
    // Requirement 1.1 / 1.3: reject HTTP in production before any network request
    validateEnv()
    if (isProd && !ENV.isHttps) {
      throw new Error('HttpClient: HTTPS required in production')
    }

    this.instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
    })

    // Request: attach Bearer token from SecureStore
    this.instance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await secureStorage.get(STORAGE_KEYS.AUTH_TOKEN)
        if (token) config.headers.set('Authorization', `Bearer ${token}`)
        return config
      },
      (err) => Promise.reject(err)
    )

    // Response: surface 401 globally; report all other errors to Sentry (Req 5.3)
    this.instance.interceptors.response.use(
      (res) => res,
      (err: AxiosError) => {
        const status = err.response?.status
        if (status !== 401) {
          Sentry?.captureException(err, {
            extra: {
              url: err.config?.url,
              status,
            },
          })
        }
        if (status === 401 && on401) on401()
        return Promise.reject(err)
      }
    )
  }

  async request<T>(
    url: string,
    options?: { method?: string; data?: any }
  ): Promise<ApiResponse<T>> {
    try {
      const res = await this.instance.request<T>({
        url,
        method: options?.method ?? 'GET',
        data: options?.data,
      })
      return { success: true, data: res.data }
    } catch (err) {
      const e = err as AxiosError<any>
      return {
        success: false,
        message: e.response?.data?.message ?? e.response?.data?.error ?? e.message,
        errorKey: e.response?.data?.error_key,
        statusCode: e.response?.status,
      }
    }
  }

  get<T>(url: string) { return this.request<T>(url) }
  post<T>(url: string, data?: any) { return this.request<T>(url, { method: 'POST', data }) }
  put<T>(url: string, data?: any) { return this.request<T>(url, { method: 'PUT', data }) }
  delete<T>(url: string) { return this.request<T>(url, { method: 'DELETE' }) }
}

export const httpClient = new HttpClient()
