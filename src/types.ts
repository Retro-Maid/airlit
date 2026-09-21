import { CalendarClock, AirVent, History, Home, LampDesk, PanelTop, Play, Radio, Settings, SlidersHorizontal, Tv, Zap, type LucideIcon } from 'lucide-react'
import { modeLabel, volumeLabel, directionLabel } from './api/labels'
import type { AirDirection, AirVolume, OperationMode } from './api/types'

export type PageId = 'home' | 'devices' | 'scenes' | 'automations' | 'reservations' | 'history' | 'settings'

export type EditorKind = 'scene' | 'automation'

export type ThemeMode = 'system' | 'light' | 'dark'

export type DeviceType = 'ac' | 'light' | 'tv' | 'ir' | 'energy'

/** View model. Holds API values, never display strings — labels come from api/labels. */
export type Device = {
  id: string
  name: string
  room: string
  type: DeviceType
  power: boolean
  online: boolean
  temperature?: number
  /** Watts, for smart meters. */
  power_w?: number
}

export type AcSettings = { mode: OperationMode; vol: AirVolume; dir: AirDirection }

/** What a given appliance actually supports; a real client reads this from `aircon.range`. */
export type AcCapabilities = { modes: OperationMode[]; volumes: AirVolume[]; directions: AirDirection[] }

export const defaultAcCapabilities: AcCapabilities = {
  modes: ['', 'cool', 'warm', 'dry'],
  volumes: ['auto', '1', '3', '5'],
  directions: ['auto', '1', '3', '5', 'swing'],
}

export const defaultAcSettings: AcSettings = { mode: 'cool', vol: 'auto', dir: 'auto' }

export const initialAcSettings: Record<string, AcSettings> = {
  'living-ac': { mode: 'cool', vol: 'auto', dir: 'auto' },
  'bedroom-ac': { mode: 'warm', vol: 'auto', dir: 'auto' },
}

export const initialDevices: Device[] = [
  { id: 'living-ac', name: 'リビングのエアコン', room: 'リビング', type: 'ac', temperature: 25, power: true, online: true },
  { id: 'living-light', name: 'リビングの照明', room: 'リビング', type: 'light', power: true, online: true },
  { id: 'living-tv', name: 'リビングのテレビ', room: 'リビング', type: 'tv', power: true, online: true },
  { id: 'bedroom-ac', name: '寝室のエアコン', room: '寝室', type: 'ac', temperature: 22, power: true, online: true },
  { id: 'study-fan', name: '書斎のサーキュレーター', room: '書斎', type: 'ir', power: true, online: true },
  { id: 'home-meter', name: 'スマートメーター', room: '分電盤', type: 'energy', power: true, online: true, power_w: 642 },
]

/** The one place a device's summary line is composed. */
export function deviceStatus(device: Device, ac?: AcSettings): string {
  if (!device.power) return 'オフ'
  if (device.type === 'ac' && device.temperature != null) {
    return `${modeLabel(ac?.mode ?? defaultAcSettings.mode)} ${device.temperature}°C`
  }
  if (device.type === 'energy') return device.power_w != null ? `${device.power_w} W` : '計測中'
  // Infrared appliances never report back, so the app only knows what it last sent.
  if (device.type === 'ir') return '赤外線'
  return 'オン'
}

export const acSummary = (ac: AcSettings) =>
  `${modeLabel(ac.mode)}・風量${volumeLabel(ac.vol)}・風向${directionLabel(ac.dir)}`

export const navigation: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'ホーム', icon: Home }, { id: 'devices', label: 'デバイス', icon: PanelTop },
  { id: 'scenes', label: 'シーン', icon: Play }, { id: 'automations', label: 'オートメーション', icon: SlidersHorizontal },
  { id: 'reservations', label: '予約', icon: CalendarClock },
  { id: 'history', label: '履歴', icon: History }, { id: 'settings', label: '設定', icon: Settings },
]

/** A button of a recognised TV / light appliance, sent by name rather than by signal id. */
export type ApplianceButton = { name: string; label: string }

export const deviceIcons: Record<DeviceType, LucideIcon> = { ac: AirVent, light: LampDesk, tv: Tv, ir: Radio, energy: Zap }

/** Appliances the Cloud API can switch on and off. An IR appliance only has learned buttons,
 * and a smart meter only measures. */
export const hasPowerSwitch = (type: DeviceType) => type === 'ac' || type === 'light' || type === 'tv'

export const deviceTypeLabels: Record<DeviceType, string> = {
  ac: 'エアコン', light: '照明', tv: 'テレビ', ir: 'その他の機器', energy: 'スマートメーター',
}
