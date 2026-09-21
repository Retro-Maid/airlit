import { RateLimiter } from './rateLimiter'
import { RemoApiError, type Appliance, type AirConSettings, type RemoDevice, type User } from './types'

const BASE_URL = 'https://api.nature.global/1'
/** A request that has not answered by now is treated as failed. */
const REQUEST_TIMEOUT_MS = 15_000

export type ClientOptions = { baseUrl?: string; fetchImpl?: typeof fetch; limiter?: RateLimiter }

/** Thin transport over the Cloud API. Every call is queued through the rate limiter. */
export class RemoClient {
  readonly limiter: RateLimiter
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private token: string, options: ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? BASE_URL
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
    this.limiter = options.limiter ?? new RateLimiter()
  }

  setToken(token: string) { this.token = token }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.limiter.schedule(async () => {
      let response: Response
      try {
        response = await this.fetchImpl(this.baseUrl + path, {
          ...init,
          // Without this a stalled connection never settles and the UI spins forever.
          signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
            ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...init.headers,
          },
        })
      } catch (cause) {
        const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
        throw new RemoApiError(
          timedOut ? '応答がありませんでした。時間をおいて再試行してください' : 'ネットワークに接続できませんでした',
          0,
          'network',
        )
      }

      this.limiter.applyHeaders(response.headers)

      if (response.status === 429) {
        const reset = Number(response.headers.get('X-Rate-Limit-Reset'))
        this.limiter.pauseUntil(Number.isFinite(reset) ? reset : null)
        throw new RemoApiError('APIの利用上限に達しました', 429, 'rate-limit',
          Number.isFinite(reset) ? Math.max(0, reset * 1000 - Date.now()) : 30_000)
      }
      if (response.status === 401) throw new RemoApiError('アクセストークンが無効です', 401, 'auth')
      if (response.status >= 500) throw new RemoApiError('Nature のサーバーが応答しません', response.status, 'server')
      if (!response.ok) throw new RemoApiError(`リクエストが拒否されました (${response.status})`, response.status, 'client')

      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    })
  }

  private form(body: Record<string, string>) {
    return { method: 'POST', body: new URLSearchParams(body).toString() }
  }

  me() { return this.request<User>('/users/me') }
  devices() { return this.request<RemoDevice[]>('/devices') }
  appliances() { return this.request<Appliance[]>('/appliances') }

  updateAirConSettings(applianceId: string, settings: Partial<AirConSettings>) {
    const body: Record<string, string> = {}
    if (settings.temp != null) body.temperature = settings.temp
    if (settings.mode != null) body.operation_mode = settings.mode
    if (settings.vol != null) body.air_volume = settings.vol
    if (settings.dir != null) body.air_direction = settings.dir
    if (settings.button != null) body.button = settings.button
    return this.request<AirConSettings>(`/appliances/${applianceId}/aircon_settings`, this.form(body))
  }

  sendLightSignal(applianceId: string, button: string) {
    return this.request<unknown>(`/appliances/${applianceId}/light`, this.form({ button }))
  }

  sendTvSignal(applianceId: string, button: string) {
    return this.request<unknown>(`/appliances/${applianceId}/tv`, this.form({ button }))
  }

  /** Generic IR appliances are driven by sending one of their learned signals. */
  sendSignal(signalId: string) {
    return this.request<unknown>(`/signals/${signalId}/send`, { method: 'POST' })
  }
}
