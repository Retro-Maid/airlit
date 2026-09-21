// Wire types for the Nature Remo Cloud API (api.nature.global/1).
// These mirror the API payloads exactly — no display strings live here.

export type ApplianceType = 'AC' | 'TV' | 'LIGHT' | 'IR' | 'EL_SMART_METER'

/** `""` is the API's value for auto. */
export type OperationMode = '' | 'cool' | 'warm' | 'dry' | 'blow'
/** `""` / `"auto"` / `"1"`–`"8"`; the usable set differs per appliance. */
export type AirVolume = string
/** `""` / `"auto"` / `"1"`–`"5"` (vertical) — horizontal swing is `dirh`. */
export type AirDirection = string

export type AirConSettings = {
  temp: string
  /** Unit the `temp` string is expressed in. */
  temp_unit?: 'c' | 'f'
  mode: OperationMode
  vol: AirVolume
  dir: AirDirection
  dirh?: AirDirection
  /** `"power-off"` means off; empty means on. */
  button: '' | 'power-off'
  updated_at?: string
}

/** Per-appliance capability ranges. The UI must build its option lists from this. */
export type AirConRange = {
  modes: Partial<Record<Exclude<OperationMode, ''> | 'auto', {
    temp: string[]
    vol: AirVolume[]
    dir: AirDirection[]
    dirh?: AirDirection[]
  }>>
  fixedButtons: string[]
}

export type Signal = { id: string; name: string; image: string }

/**
 * A button of a recognised TV / light appliance. Unlike a learned signal it has no id — it is
 * sent by name through /appliances/{id}/tv or /light — and it carries a Japanese label.
 */
export type ApplianceButton = { name: string; image: string; label: string }

export type SensorType = 'te' | 'hu' | 'il' | 'mo'
export type SensorValue = { val: number; created_at: string }

export type RemoDevice = {
  id: string
  name: string
  firmware_version: string
  mac_address: string
  serial_number: string
  temperature_offset: number
  humidity_offset: number
  created_at: string
  updated_at: string
  newest_events: Partial<Record<SensorType, SensorValue>>
}

export type EchonetLiteProperty = { name: string; epc: number; val: string; updated_at: string }

export type Appliance = {
  id: string
  device: Pick<RemoDevice, 'id' | 'name'> & Partial<RemoDevice>
  model: { id: string; manufacturer: string; name: string; image: string } | null
  nickname: string
  image: string
  type: ApplianceType
  settings?: AirConSettings | null
  aircon?: { range: AirConRange; tempUnit: 'c' | 'f' } | null
  tv?: { state: { input: 't' | 'bs' | 'cs' }; buttons: ApplianceButton[] } | null
  light?: { state: { brightness: string; power: 'on' | 'off'; last_button: string }; buttons: ApplianceButton[] } | null
  smart_meter?: { echonetlite_properties: EchonetLiteProperty[] } | null
  signals: Signal[]
}

export type User = { id: string; nickname: string }

/** Budget headers returned on every Cloud API response. */
export type RateLimitState = {
  limit: number | null
  remaining: number | null
  /** Epoch seconds at which the window resets. */
  reset: number | null
}

export class RemoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'auth' | 'rate-limit' | 'network' | 'server' | 'client',
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'RemoApiError'
  }
}
