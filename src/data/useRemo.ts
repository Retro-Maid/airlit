import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RemoApiError } from '../api/types'
import type { LimiterSnapshot } from '../api/rateLimiter'
import { defaultAcCapabilities, defaultAcSettings, type AcSettings, type Device } from '../types'
import type { Home, RemoAdapter } from './adapter'
import { recordSamples } from './history'

export type ConnectionStatus = 'loading' | 'ready' | 'error' | 'offline'

export type RemoState = Home & {
  status: ConnectionStatus
  error: string | null
  errorKind: RemoApiError['kind'] | null
  lastSyncAt: number | null
  /** Devices with an unconfirmed write in flight. */
  pending: Record<string, true>
  limiter: LimiterSnapshot | null
}

const emptyHome: Home = { devices: [], acSettings: {}, capabilities: {}, sensors: {}, signals: {}, buttons: {}, remoUnits: [] }
/** Writes settle before being sent, so holding ± does not spend one request per press. */
const WRITE_DEBOUNCE_MS = 700
const POLL_MS = 60_000

/** Keep object identity for devices whose fields did not change, so lists do not re-render. */
function reconcile(previous: Device[], incoming: Device[]): Device[] {
  const byId = new Map(previous.map(d => [d.id, d]))
  let changed = previous.length !== incoming.length
  const next = incoming.map(device => {
    const old = byId.get(device.id)
    if (old && (Object.keys(device) as (keyof Device)[]).every(k => old[k] === device[k])) return old
    changed = true
    return device
  })
  return changed ? next : previous
}

export function useRemo(adapter: RemoAdapter, suspended = false) {
  const [state, setState] = useState<RemoState>({
    ...emptyHome, status: 'loading', error: null, errorKind: null,
    lastSyncAt: null, pending: {}, limiter: null,
  })
  const suspendedRef = useRef(suspended)
  suspendedRef.current = suspended
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter
  const writeTimers = useRef(new Map<string, number>())
  const writeQueue = useRef(new Map<string, AcSettings & { temperature?: number }>())
  const timers = writeTimers.current
  const queued = writeQueue.current

  const fail = useCallback((cause: unknown) => {
    const error = cause instanceof RemoApiError ? cause : null
    setState(s => ({
      ...s,
      status: navigator.onLine === false ? 'offline' : 'error',
      error: error?.message ?? '不明なエラーが発生しました',
      errorKind: error?.kind ?? null,
    }))
  }, [])

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setState(s => ({ ...s, status: s.lastSyncAt ? s.status : 'loading' }))
    try {
      const home = await adapterRef.current.load()
      recordSamples(adapterRef.current.kind, home.devices)
      setState(s => ({
        ...s,
        ...home,
        devices: reconcile(s.devices, home.devices),
        status: 'ready',
        error: null,
        errorKind: null,
        lastSyncAt: Date.now(),
      }))
    } catch (cause) {
      fail(cause)
    }
  }, [fail])

  // Initial load, and reload whenever the adapter is swapped (sign in / sign out).
  // A suspended window (the hidden mini controller) must not spend requests before it is shown.
  useEffect(() => {
    // Everything loaded so far belonged to the previous account (or to the demo home), so it is
    // dropped before the new adapter answers. Leaving it on screen under a different connection
    // would show appliances that are no longer reachable.
    timers.forEach(t => window.clearTimeout(t))
    timers.clear()
    queued.clear()
    setState({
      ...emptyHome, status: 'loading', error: null, errorKind: null,
      lastSyncAt: null, pending: {}, limiter: null,
    })
    if (!suspended) void refresh()
  }, [adapter, refresh, suspended, timers, queued])

  // Poll only while the window is visible — a hidden window must not spend the budget.
  useEffect(() => {
    let timer = 0
    const tick = () => { if (!document.hidden && !suspendedRef.current) void refresh(true) }
    const start = () => { timer = window.setInterval(tick, POLL_MS) }
    const onVisibility = () => {
      window.clearInterval(timer)
      if (!document.hidden && !suspendedRef.current) { void refresh(true); start() }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [refresh])

  // Surface the limiter's budget so the header can show it.
  useEffect(() => {
    const client = (adapter as { client?: { limiter?: { subscribe(fn: (s: LimiterSnapshot) => void): () => void } } }).client
    if (!client?.limiter) { setState(s => ({ ...s, limiter: null })); return }
    return client.limiter.subscribe(limiter => setState(s => ({ ...s, limiter })))
  }, [adapter])

  useEffect(() => {
    const online = () => void refresh(true)
    const offline = () => setState(s => ({ ...s, status: 'offline' }))
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [refresh])

  useEffect(() => () => { timers.forEach(t => window.clearTimeout(t)) }, [timers])

  const markPending = (id: string, on: boolean) =>
    setState(s => {
      const pending = { ...s.pending }
      if (on) pending[id] = true
      else delete pending[id]
      return { ...s, pending }
    })

  /** Optimistic write with rollback; AC changes are merged and sent once they settle. */
  const flush = useCallback(async (device: Device, snapshot: { ac: AcSettings; temperature?: number }) => {
    const payload = queued.get(device.id)
    queued.delete(device.id)
    if (!payload) return
    markPending(device.id, true)
    try {
      await adapterRef.current.setAirCon(device, payload)
      setState(s => ({ ...s, lastSyncAt: Date.now(), error: null, errorKind: null }))
    } catch (cause) {
      // roll back to what the server last told us
      setState(s => ({
        ...s,
        acSettings: { ...s.acSettings, [device.id]: snapshot.ac },
        devices: s.devices.map(d => d.id === device.id ? { ...d, temperature: snapshot.temperature } : d),
      }))
      fail(cause)
    } finally {
      markPending(device.id, false)
    }
  }, [fail, queued])

  const setAirCon = useCallback((device: Device, next: Partial<AcSettings> & { temperature?: number }) => {
    setState(s => {
      const current = s.acSettings[device.id] ?? defaultAcSettings
      const ac: AcSettings = { ...current, ...next }
      const temperature = next.temperature ?? s.devices.find(d => d.id === device.id)?.temperature
      const snapshot = { ac: current, temperature: s.devices.find(d => d.id === device.id)?.temperature }
      queued.set(device.id, { ...ac, temperature })
      window.clearTimeout(timers.get(device.id))
      timers.set(device.id, window.setTimeout(() => { void flush(device, snapshot) }, WRITE_DEBOUNCE_MS))
      return {
        ...s,
        acSettings: { ...s.acSettings, [device.id]: ac },
        devices: next.temperature != null
          ? s.devices.map(d => d.id === device.id ? { ...d, temperature: next.temperature } : d)
          : s.devices,
      }
    })
  }, [flush, queued, timers])

  const setPower = useCallback(async (device: Device, on: boolean) => {
    setState(s => ({ ...s, devices: s.devices.map(d => d.id === device.id ? { ...d, power: on } : d) }))
    markPending(device.id, true)
    try {
      await adapterRef.current.setPower(device, on)
      setState(s => ({ ...s, lastSyncAt: Date.now() }))
    } catch (cause) {
      setState(s => ({ ...s, devices: s.devices.map(d => d.id === device.id ? { ...d, power: !on } : d) }))
      fail(cause)
    } finally {
      markPending(device.id, false)
    }
  }, [fail])

  const sendButton = useCallback(async (device: Device, button: string) => {
    markPending(device.id, true)
    try { await adapterRef.current.sendButton(device, button) }
    catch (cause) { fail(cause) }
    finally { markPending(device.id, false) }
  }, [fail])

  const sendSignal = useCallback(async (device: Device, signalId: string) => {
    markPending(device.id, true)
    try { await adapterRef.current.sendSignal(device, signalId) }
    catch (cause) { fail(cause) }
    finally { markPending(device.id, false) }
  }, [fail])

  const capabilitiesFor = useCallback(
    (id: string) => state.capabilities[id] ?? defaultAcCapabilities,
    [state.capabilities],
  )

  return useMemo(
    () => ({ ...state, refresh, setAirCon, setPower, sendButton, sendSignal, capabilitiesFor }),
    [state, refresh, setAirCon, setPower, sendButton, sendSignal, capabilitiesFor],
  )
}
