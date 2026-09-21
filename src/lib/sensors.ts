import { Droplets, Sun, Thermometer, UserRound, type LucideIcon } from 'lucide-react'
import { formatRelative } from './format'

/**
 * Nature Remo models differ in what they can measure — Remo 3 reports all four values,
 * Remo mini only temperature, Remo E none at all. The home screen is built from whatever
 * `newest_events` actually contained, so a panel never claims a sensor the hardware lacks.
 */
export type Sensors = {
  temperature?: number
  humidity?: number
  illumination?: number
  movedAt?: string
}

export type SensorPanel = { key: string; icon: LucideIcon; label: string; value: string; note: string; tone: string }

const temperatureNote = (v: number) =>
  v < 18 ? '肌寒い' : v < 25 ? '快適' : v < 28 ? 'やや暑い' : '暑い'

const humidityNote = (v: number) =>
  v < 40 ? '乾燥ぎみ' : v < 60 ? '快適' : v < 70 ? 'やや多湿' : '多湿'

/** `il` is a raw sensor reading, not lux, so it is shown without a unit. */
const illuminationNote = (v: number) =>
  v < 10 ? '暗い' : v < 100 ? 'やや暗い' : v < 500 ? '明るい' : 'とても明るい'

export function sensorPanels(sensors: Sensors, now = Date.now()): SensorPanel[] {
  const panels: SensorPanel[] = []

  if (sensors.temperature != null) {
    panels.push({
      key: 'te', icon: Thermometer, label: '温度', tone: 'green',
      value: `${sensors.temperature.toFixed(1)}°`,
      note: temperatureNote(sensors.temperature),
    })
  }
  if (sensors.humidity != null) {
    panels.push({
      key: 'hu', icon: Droplets, label: '湿度', tone: 'blue',
      value: `${Math.round(sensors.humidity)}%`,
      note: humidityNote(sensors.humidity),
    })
  }
  if (sensors.illumination != null) {
    panels.push({
      key: 'il', icon: Sun, label: '明るさ', tone: 'yellow',
      value: String(Math.round(sensors.illumination)),
      note: illuminationNote(sensors.illumination),
    })
  }
  if (sensors.movedAt) {
    // The API reports when motion was last seen, not whether someone is there now.
    panels.push({
      key: 'mo', icon: UserRound, label: '人感', tone: 'navy',
      value: formatRelative(sensors.movedAt, now),
      note: '最終検知',
    })
  }
  return panels
}
