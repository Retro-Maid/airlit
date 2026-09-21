import type { AcSettings } from '../types'

/**
 * Scenes and automations have no equivalent in the Cloud API — they are this app's own
 * concept, so they are stored locally. Keyed by adapter kind because device ids from the
 * demo home do not exist in a real account (and vice versa).
 */

export type SceneAction =
  | { deviceId: string; kind: 'power'; power: boolean }
  | { deviceId: string; kind: 'ac'; ac: Partial<AcSettings>; temperature?: number }
  /** Sends one learned button of a generic infrared appliance. */
  | { deviceId: string; kind: 'signal'; signalId: string; signalName: string }

export type SceneIcon = 'home' | 'moon' | 'away' | 'light'

export type Scene = {
  id: string
  name: string
  description: string
  icon: SceneIcon
  color: 'blue' | 'indigo' | 'orange' | 'violet'
  actions: SceneAction[]
}

export type AutomationTrigger =
  | { type: 'time'; time: string; repeat: 'daily' | 'weekdays' | 'weekends' }
  | { type: 'sensor'; sensor: 'temperature' | 'humidity' | 'illumination'; comparator: 'above' | 'below'; value: number }
  | { type: 'location' }

export type Automation = {
  id: string
  name: string
  trigger: AutomationTrigger
  actions: SceneAction[]
  enabled: boolean
  /** Epoch ms of the last run, so a trigger fires once per occurrence. */
  lastFiredAt: number | null
}

/**
 * 予約 — a one-shot automation. It runs once at `at` and is then finished, so it carries a
 * status instead of an enabled flag: 'missed' is for a reservation whose moment passed while
 * the app was closed, which is never run retroactively but must not be hidden either.
 */
export type Reservation = {
  id: string
  name: string
  /** Epoch ms of the moment it should run. */
  at: number
  actions: SceneAction[]
  /** The appliance it was created from, so its own schedule tab can list it. */
  deviceId: string
  status: 'pending' | 'done' | 'missed'
}

export type Library = { scenes: Scene[]; automations: Automation[]; reservations: Reservation[] }

const KEY = (kind: string) => `airlit-library:${kind}`

export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const emptyLibrary = (): Library => ({ scenes: [], automations: [], reservations: [] })

/** Ids of the samples that early builds seeded into every home, including real accounts. */
const SEED_IDS = new Set([
  'scene-home', 'scene-sleep', 'scene-away', 'scene-movie',
  'auto-morning', 'auto-away', 'auto-humidity',
])

/** Sample content for the demo home only — a real account starts empty. */
export function defaultLibrary(): Library {
  return {
    reservations: [],
    scenes: [
      { id: 'scene-home', name: '帰宅', description: '照明・エアコンをオンに', icon: 'home', color: 'blue', actions: [
        { deviceId: 'living-light', kind: 'power', power: true },
        { deviceId: 'living-ac', kind: 'ac', ac: { mode: 'cool' }, temperature: 25 },
      ] },
      { id: 'scene-sleep', name: '就寝', description: '照明をオフに・快適な温度へ', icon: 'moon', color: 'indigo', actions: [
        { deviceId: 'living-light', kind: 'power', power: false },
        { deviceId: 'living-tv', kind: 'power', power: false },
        { deviceId: 'bedroom-ac', kind: 'ac', ac: { mode: 'warm' }, temperature: 22 },
      ] },
      { id: 'scene-away', name: '外出', description: 'すべての家電をオフに', icon: 'away', color: 'orange', actions: [
        { deviceId: 'living-light', kind: 'power', power: false },
        { deviceId: 'living-tv', kind: 'power', power: false },
        { deviceId: 'living-ac', kind: 'power', power: false },
        { deviceId: 'bedroom-ac', kind: 'power', power: false },
      ] },
      { id: 'scene-movie', name: '映画', description: '照明を暗く・テレビをオンに', icon: 'light', color: 'violet', actions: [
        { deviceId: 'living-tv', kind: 'power', power: true },
        { deviceId: 'living-light', kind: 'power', power: true },
      ] },
    ],
    automations: [
      { id: 'auto-morning', name: '朝の準備', enabled: true, lastFiredAt: null,
        trigger: { type: 'time', time: '07:00', repeat: 'weekdays' },
        actions: [{ deviceId: 'living-light', kind: 'power', power: true }] },
      { id: 'auto-away', name: '外出を検知', enabled: true, lastFiredAt: null,
        trigger: { type: 'location' },
        actions: [{ deviceId: 'living-ac', kind: 'power', power: false }] },
      { id: 'auto-humidity', name: '湿度を保つ', enabled: false, lastFiredAt: null,
        trigger: { type: 'sensor', sensor: 'humidity', comparator: 'below', value: 40 },
        actions: [{ deviceId: 'living-light', kind: 'power', power: true }] },
    ],
  }
}

export function loadLibrary(kind: string): Library {
  const seeded = () => kind === 'mock' ? defaultLibrary() : emptyLibrary()
  try {
    const raw = localStorage.getItem(KEY(kind))
    if (!raw) return seeded()
    const parsed = JSON.parse(raw) as Partial<Library>
    // Earlier builds wrote the demo samples into real homes too, where their device ids point
    // at nothing. Drop them on load; anything the user made themselves is kept.
    const drop = kind === 'mock' ? () => false : (id: string) => SEED_IDS.has(id)
    return {
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes.filter(s => !drop(s.id)) : [],
      automations: Array.isArray(parsed.automations) ? parsed.automations.filter(a => !drop(a.id)) : [],
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
    }
  } catch {
    return seeded()
  }
}

export function saveLibrary(kind: string, library: Library) {
  try { localStorage.setItem(KEY(kind), JSON.stringify(library)) } catch { /* private mode */ }
}

const WEEKDAY = [1, 2, 3, 4, 5]

/** Whether a time trigger should fire now, given when it last did. */
export function shouldFire(automation: Automation, now: Date, sinceMs: number): boolean {
  if (!automation.enabled) return false
  if (automation.trigger.type !== 'time') return false
  const { time, repeat } = automation.trigger
  const [hh, mm] = time.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false

  const day = now.getDay()
  if (repeat === 'weekdays' && !WEEKDAY.includes(day)) return false
  if (repeat === 'weekends' && WEEKDAY.includes(day)) return false

  const scheduled = new Date(now)
  scheduled.setHours(hh, mm, 0, 0)
  const at = scheduled.getTime()
  // Fire once, when the clock crosses the scheduled moment — never retroactively.
  return at <= now.getTime() && at > sinceMs
}

export const triggerSummary = (trigger: AutomationTrigger): string => {
  if (trigger.type === 'time') {
    const repeat = trigger.repeat === 'daily' ? '毎日' : trigger.repeat === 'weekdays' ? '平日' : '週末'
    return `${repeat} ${trigger.time}`
  }
  if (trigger.type === 'sensor') {
    const sensor = trigger.sensor === 'temperature' ? '室温' : trigger.sensor === 'humidity' ? '湿度' : '照度'
    const unit = trigger.sensor === 'temperature' ? '°C' : trigger.sensor === 'humidity' ? '%' : ''
    return `${sensor}が${trigger.value}${unit}${trigger.comparator === 'above' ? '以上' : '未満'}になったとき`
  }
  return '全員が家から離れたとき'
}

/**
 * Turns a "HH:MM" from a time input into a moment in the future. A time that already passed
 * today means tomorrow — otherwise a reservation set at 23:31 for 23:30 would never run.
 */
export function reservationAt(time: string, from: Date = new Date()): number | null {
  const [hh, mm] = time.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  const at = new Date(from)
  at.setHours(hh, mm, 0, 0)
  if (at.getTime() <= from.getTime()) at.setDate(at.getDate() + 1)
  return at.getTime()
}

/**
 * How a pending reservation resolves on a tick: it runs only if the clock crossed its moment
 * since the last tick, matching `shouldFire`. A moment that passed earlier — while the app was
 * closed — is reported as missed rather than run late.
 */
export function resolveReservation(reservation: Reservation, nowMs: number, sinceMs: number):
  'pending' | 'done' | 'missed' {
  if (reservation.status !== 'pending') return reservation.status
  if (reservation.at > nowMs) return 'pending'
  return reservation.at > sinceMs ? 'done' : 'missed'
}

/** "あと1時間20分" for a pending reservation. */
export function untilLabel(at: number, now = Date.now()): string {
  const diff = at - now
  if (diff <= 0) return 'まもなく'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'まもなく'
  if (minutes < 60) return `あと${minutes}分`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest ? `あと${hours}時間${rest}分` : `あと${hours}時間`
  return `あと${Math.floor(hours / 24)}日`
}

/**
 * The absolute moment a time-based automation will next run, honouring the weekday/weekend
 * rule. Used for the 「次の実行」 line, which must be comparable with a reservation's `at`.
 */
export function nextRunAt(automation: Automation, from: Date = new Date()): number | null {
  if (!automation.enabled || automation.trigger.type !== 'time') return null
  const { time, repeat } = automation.trigger
  const [hh, mm] = time.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  for (let offset = 0; offset <= 7; offset += 1) {
    const at = new Date(from)
    at.setDate(at.getDate() + offset)
    at.setHours(hh, mm, 0, 0)
    if (at.getTime() <= from.getTime()) continue
    const day = at.getDay()
    if (repeat === 'weekdays' && !WEEKDAY.includes(day)) continue
    if (repeat === 'weekends' && WEEKDAY.includes(day)) continue
    return at.getTime()
  }
  return null
}
