import type { Device } from '../types'

/**
 * The Cloud API returns no history, so the only honest source for a usage chart is what this
 * app has observed while running. Samples are appended on each successful poll and kept
 * locally, capped so the store cannot grow without bound.
 *
 * Remo E is the case this pays off for: instantaneous power moves every poll. An AC or IR
 * appliance changes rarely, so its chart stays flat until someone actually uses it.
 */
export type Sample = { t: number; v: number }

export type Series = {
  samples: Sample[]
  unit: 'W' | '°C' | 'on'
}

const KEY = (kind: string) => `airlit-history:${kind}`
const MAX_SAMPLES = 480
/** Do not store a point more often than this, however fast polling happens. */
const MIN_GAP_MS = 45_000

export const unitFor = (device: Device): Series['unit'] =>
  device.type === 'energy' ? 'W' : device.type === 'ac' ? '°C' : 'on'

export const valueFor = (device: Device): number | null => {
  if (device.type === 'energy') return device.power_w ?? null
  if (device.type === 'ac') return device.temperature ?? null
  return device.power ? 1 : 0
}

type Store = Record<string, Sample[]>

function read(kind: string): Store {
  try {
    const raw = localStorage.getItem(KEY(kind))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    // Anything written by an older build could have a different shape; a non-array here would
    // throw inside the chart instead of simply showing no data.
    const store: Store = {}
    for (const [id, samples] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(samples)) store[id] = samples.filter(s => typeof s?.t === 'number' && typeof s?.v === 'number')
    }
    return store
  } catch { return {} }
}

function write(kind: string, store: Store) {
  try { localStorage.setItem(KEY(kind), JSON.stringify(store)) } catch { /* quota or private mode */ }
}

/** Appends one point per device, respecting the minimum gap. Returns true if anything changed. */
export function recordSamples(kind: string, devices: Device[], now = Date.now()): boolean {
  const store = read(kind)
  let changed = false
  for (const device of devices) {
    const value = valueFor(device)
    if (value == null) continue
    const list = store[device.id] ?? []
    const last = list[list.length - 1]
    if (last && now - last.t < MIN_GAP_MS) continue
    list.push({ t: now, v: value })
    store[device.id] = list.length > MAX_SAMPLES ? list.slice(-MAX_SAMPLES) : list
    changed = true
  }
  if (changed) write(kind, store)
  return changed
}

export function readSeries(kind: string, device: Device, windowMs?: number): Series {
  const all = read(kind)[device.id] ?? []
  const cutoff = windowMs ? Date.now() - windowMs : 0
  return { samples: windowMs ? all.filter(s => s.t >= cutoff) : all, unit: unitFor(device) }
}

export type Stats = { count: number; first: number; last: number; min: number; max: number; avg: number; onRatio: number }

export function statsOf(series: Series): Stats | null {
  const { samples } = series
  if (!samples.length) return null
  const values = samples.map(s => s.v)
  return {
    count: samples.length,
    first: samples[0].t,
    last: samples[samples.length - 1].t,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    onRatio: samples.filter(s => s.v > 0).length / samples.length,
  }
}
