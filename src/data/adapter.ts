import { RemoClient } from '../api/client'
import type { Appliance, OperationMode } from '../api/types'
import {
  defaultAcCapabilities, defaultAcSettings, initialAcSettings, initialDevices,
  type AcCapabilities, type AcSettings, type ApplianceButton, type Device, type DeviceType,
} from '../types'

export type Home = {
  devices: Device[]
  acSettings: Record<string, AcSettings>
  capabilities: Record<string, AcCapabilities>
  sensors: { temperature?: number; humidity?: number; illumination?: number; movedAt?: string }
  /** Learned IR buttons, for generic appliances. */
  signals: Record<string, { id: string; name: string }[]>
  /** Buttons of recognised TV / light appliances, sent by name. */
  buttons: Record<string, ApplianceButton[]>
  /** The Remo units themselves, as reported by /1/devices. */
  remoUnits: { id: string; name: string; firmware: string; updatedAt: string }[]
}

/** Everything the UI needs from a backend. Mock and Cloud both satisfy it. */
export type RemoAdapter = {
  readonly kind: 'mock' | 'cloud' | 'none'
  load(): Promise<Home>
  setPower(device: Device, on: boolean): Promise<void>
  /** Sends one button of a recognised TV / light appliance. */
  sendButton(device: Device, button: string): Promise<void>
  setAirCon(device: Device, settings: AcSettings & { temperature?: number }): Promise<void>
  sendSignal(device: Device, signalId: string): Promise<void>
}

const emptyHome = (): Home => ({ devices: [], acSettings: {}, capabilities: {}, sensors: {}, signals: {}, buttons: {}, remoUnits: [] })

// ---------------------------------------------------------------------------

/**
 * Stands in before a token is entered. It answers with an empty home so the UI can prompt
 * for setup rather than showing sample data that looks like the user's own.
 */
export class UnconfiguredAdapter implements RemoAdapter {
  readonly kind = 'none'
  async load(): Promise<Home> { return emptyHome() }
  async setPower() { /* nothing to control yet */ }
  async sendButton() { /* nothing to control yet */ }
  async setAirCon() { /* nothing to control yet */ }
  async sendSignal() { /* nothing to control yet */ }
}

// ---------------------------------------------------------------------------

/** Serves the bundled sample home. Used until a token is entered. */
export class MockAdapter implements RemoAdapter {
  readonly kind = 'mock'
  private delay: number

  constructor(delay = 260) { this.delay = delay }

  private wait() { return new Promise<void>(resolve => setTimeout(resolve, this.delay)) }

  async load(): Promise<Home> {
    await this.wait()
    return {
      devices: initialDevices.map(d => ({ ...d })),
      acSettings: { ...initialAcSettings },
      capabilities: Object.fromEntries(initialDevices.filter(d => d.type === 'ac').map(d => [d.id, defaultAcCapabilities])),
      sensors: { temperature: 24.8, humidity: 54, illumination: 184, movedAt: new Date().toISOString() },
      remoUnits: [{ id: 'demo-remo', name: 'Remo 3（サンプル）', firmware: 'Remo/1.14.4', updatedAt: new Date().toISOString() }],
      signals: {
        'study-fan': [
          { id: 'sig-power', name: '電源' }, { id: 'sig-speed', name: '風量' },
          { id: 'sig-swing', name: '首振り' }, { id: 'sig-timer', name: 'タイマー' },
        ],
      },
      buttons: {
        'living-light': [
          { name: 'on', label: '点灯' }, { name: 'off', label: '消灯' },
          { name: 'on-100', label: '全灯' }, { name: 'night', label: '常夜灯' },
          { name: 'bright-up', label: '明るく' }, { name: 'bright-down', label: '暗く' },
        ],
        'living-tv': [
          { name: 'power', label: '電源' }, { name: 'mute', label: '消音' },
          { name: 'vol-up', label: '音量＋' }, { name: 'vol-down', label: '音量−' },
          { name: 'ch-up', label: 'チャンネル＋' }, { name: 'ch-down', label: 'チャンネル−' },
          { name: 'up', label: '上' }, { name: 'down', label: '下' },
          { name: 'left', label: '左' }, { name: 'right', label: '右' }, { name: 'ok', label: '決定' },
          { name: 'back', label: '戻る' }, { name: 'home', label: 'ホーム' }, { name: 'menu', label: 'メニュー' },
          { name: 'terrestrial', label: '地上D' }, { name: 'bs', label: 'BS' }, { name: 'cs', label: 'CS' },
        ],
      },
    }
  }

  async setPower() { await this.wait() }
  async sendButton() { await this.wait() }
  async setAirCon() { await this.wait() }
  async sendSignal() { await this.wait() }
}

// ---------------------------------------------------------------------------

const APPLIANCE_TYPES: Record<string, DeviceType> = {
  AC: 'ac', LIGHT: 'light', TV: 'tv', IR: 'ir', EL_SMART_METER: 'energy',
}

/** Instantaneous power, in watts (ECHONET Lite EPC 0xE7 = 231). */
const INSTANT_POWER_EPC = 231

export function capabilitiesOf(appliance: Appliance): AcCapabilities {
  const range = appliance.aircon?.range
  if (!range) return defaultAcCapabilities
  const modes = Object.keys(range.modes) as (OperationMode | 'auto')[]
  const asMode = (m: OperationMode | 'auto'): OperationMode => (m === 'auto' ? '' : m)
  const first = range.modes[modes[0] as keyof typeof range.modes]
  return {
    modes: modes.map(asMode),
    volumes: first?.vol?.length ? first.vol : defaultAcCapabilities.volumes,
    directions: first?.dir?.length ? first.dir : defaultAcCapabilities.directions,
  }
}

export function toDevice(appliance: Appliance): Device {
  const type = APPLIANCE_TYPES[appliance.type] ?? 'ir'
  const settings = appliance.settings
  const power = type === 'ac'
    ? settings?.button !== 'power-off'
    : appliance.light?.state.power === 'on' || type !== 'light'
  const watts = appliance.smart_meter?.echonetlite_properties
    ?.find(p => p.epc === INSTANT_POWER_EPC)?.val
  return {
    id: appliance.id,
    name: appliance.nickname || appliance.model?.name || '名称未設定',
    room: appliance.device?.name ?? '',
    type,
    power,
    online: true,
    temperature: settings?.temp ? Number(settings.temp) : undefined,
    power_w: watts != null ? Number(watts) : undefined,
  }
}

/** Talks to api.nature.global through the rate-limited client. */
export class CloudAdapter implements RemoAdapter {
  readonly kind = 'cloud'
  constructor(readonly client: RemoClient) {}

  async load(): Promise<Home> {
    const [appliances, devices] = await Promise.all([this.client.appliances(), this.client.devices()])
    const home = emptyHome()
    for (const appliance of appliances) {
      const device = toDevice(appliance)
      home.devices.push(device)
      if (device.type === 'ac') {
        const s = appliance.settings
        home.acSettings[device.id] = s
          ? { mode: s.mode, vol: s.vol, dir: s.dir }
          : { ...defaultAcSettings }
        home.capabilities[device.id] = capabilitiesOf(appliance)
      }
      if (appliance.signals?.length) {
        home.signals[device.id] = appliance.signals.map(s => ({ id: s.id, name: s.name }))
      }
      const remote = appliance.light?.buttons ?? appliance.tv?.buttons
      if (remote?.length) {
        home.buttons[device.id] = remote.map(b => ({ name: b.name, label: b.label }))
      }
    }
    home.remoUnits = devices.map(d => ({
      id: d.id, name: d.name, firmware: d.firmware_version, updatedAt: d.updated_at,
    }))
    const newest = devices[0]?.newest_events
    home.sensors = {
      temperature: newest?.te?.val,
      humidity: newest?.hu?.val,
      illumination: newest?.il?.val,
      movedAt: newest?.mo?.created_at,
    }
    return home
  }

  async setPower(device: Device, on: boolean) {
    if (device.type === 'ac') {
      await this.client.updateAirConSettings(device.id, { button: on ? '' : 'power-off' })
      return
    }
    if (device.type === 'light') {
      await this.client.sendLightSignal(device.id, on ? 'on' : 'off')
      return
    }
    // Falling through to the TV endpoint for an IR appliance or a smart meter would just fail.
    if (device.type !== 'tv') return
    await this.client.sendTvSignal(device.id, 'power')
  }

  async setAirCon(device: Device, settings: AcSettings & { temperature?: number }) {
    await this.client.updateAirConSettings(device.id, {
      mode: settings.mode,
      vol: settings.vol,
      dir: settings.dir,
      ...(settings.temperature != null ? { temp: String(settings.temperature) } : {}),
    })
  }

  async sendButton(device: Device, button: string) {
    if (device.type === 'light') await this.client.sendLightSignal(device.id, button)
    else await this.client.sendTvSignal(device.id, button)
  }

  async sendSignal(_device: Device, signalId: string) {
    await this.client.sendSignal(signalId)
  }
}
