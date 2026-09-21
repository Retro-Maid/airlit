import type { RateLimitState } from './types'

/**
 * The Cloud API allows 30 requests per 5 minutes per account and answers 429 beyond that.
 * Everything that talks to the API goes through here, so the budget is spent deliberately:
 * requests run one at a time, spaced out, and the window is tracked locally as well as from
 * the server's own headers.
 */
export type LimiterSnapshot = RateLimitState & {
  /** Requests waiting to be sent. */
  queued: number
  /** Set while backing off after a 429; epoch ms. */
  pausedUntil: number | null
  /** Locally counted requests inside the current window. */
  usedInWindow: number
}

export type LimiterOptions = {
  budget?: number
  windowMs?: number
  minIntervalMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export class RateLimiter {
  private readonly budget: number
  private readonly windowMs: number
  private readonly minIntervalMs: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  private sentAt: number[] = []
  private queue: (() => void)[] = []
  private running = false
  private lastStart = 0
  private pausedUntil: number | null = null
  private server: RateLimitState = { limit: null, remaining: null, reset: null }
  private listeners = new Set<(s: LimiterSnapshot) => void>()

  constructor(options: LimiterOptions = {}) {
    this.budget = options.budget ?? 30
    this.windowMs = options.windowMs ?? 5 * 60 * 1000
    this.minIntervalMs = options.minIntervalMs ?? 350
    this.now = options.now ?? (() => Date.now())
    this.sleep = options.sleep ?? defaultSleep
  }

  subscribe(fn: (s: LimiterSnapshot) => void) {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => { this.listeners.delete(fn) }
  }

  snapshot(): LimiterSnapshot {
    this.prune()
    const usedInWindow = this.sentAt.length
    return {
      limit: this.server.limit ?? this.budget,
      // Prefer the server's count; fall back to what we have spent locally.
      remaining: this.server.remaining ?? Math.max(0, this.budget - usedInWindow),
      reset: this.server.reset,
      queued: this.queue.length,
      pausedUntil: this.pausedUntil,
      usedInWindow,
    }
  }

  /** Feed the headers from a response so our view of the budget matches the server's. */
  applyHeaders(headers: Headers) {
    const num = (name: string) => {
      const raw = headers.get(name)
      if (raw == null) return null
      const value = Number(raw)
      return Number.isFinite(value) ? value : null
    }
    const limit = num('X-Rate-Limit-Limit')
    const remaining = num('X-Rate-Limit-Remaining')
    const reset = num('X-Rate-Limit-Reset')
    if (limit != null) this.server.limit = limit
    if (remaining != null) this.server.remaining = remaining
    if (reset != null) this.server.reset = reset
    this.emit()
  }

  /** Back off until the window resets. `resetEpochSeconds` comes from the 429 response. */
  pauseUntil(resetEpochSeconds: number | null, fallbackMs = 30_000) {
    const target = resetEpochSeconds != null ? resetEpochSeconds * 1000 : this.now() + fallbackMs
    this.pausedUntil = Math.max(this.pausedUntil ?? 0, target)
    this.server.remaining = 0
    this.emit()
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => { task().then(resolve, reject) })
      this.emit()
      void this.drain()
    })
  }

  private async drain() {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length) {
        await this.waitForSlot()
        const run = this.queue.shift()
        if (!run) break
        this.lastStart = this.now()
        this.sentAt.push(this.lastStart)
        this.emit()
        run()
        // Serialise: give the in-flight request its spacing before starting the next.
        await this.sleep(this.minIntervalMs)
      }
    } finally {
      this.running = false
      this.emit()
    }
  }

  private async waitForSlot() {
    for (;;) {
      const now = this.now()
      if (this.pausedUntil && now < this.pausedUntil) {
        await this.sleep(Math.min(this.pausedUntil - now, 1000))
        continue
      }
      if (this.pausedUntil && now >= this.pausedUntil) {
        this.pausedUntil = null
        this.server.remaining = null
        this.emit()
      }
      this.prune()
      if (this.sentAt.length >= this.budget) {
        const oldest = this.sentAt[0]
        await this.sleep(Math.max(50, oldest + this.windowMs - now))
        continue
      }
      const sinceLast = now - this.lastStart
      if (sinceLast < this.minIntervalMs) {
        await this.sleep(this.minIntervalMs - sinceLast)
        continue
      }
      return
    }
  }

  private prune() {
    const cutoff = this.now() - this.windowMs
    if (this.sentAt.length && this.sentAt[0] <= cutoff) {
      this.sentAt = this.sentAt.filter(t => t > cutoff)
    }
  }

  private emit() {
    if (!this.listeners.size) return
    const snapshot = this.snapshot()
    this.listeners.forEach(fn => fn(snapshot))
  }
}
