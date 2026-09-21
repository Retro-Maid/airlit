// The only place API values are turned into Japanese display text.
// State always holds the API value; components render through these maps.

import type { AirDirection, AirVolume, OperationMode } from './types'

export type Option<T extends string = string> = { value: T; label: string }

export const MODE_LABELS: Record<OperationMode, string> = {
  '': '自動',
  cool: '冷房',
  warm: '暖房',
  dry: '除湿',
  blow: '送風',
}

/** Fan speeds the API can return. Real appliances expose a subset via `aircon.range`. */
export const VOLUME_LABELS: Record<string, string> = {
  '': '自動',
  auto: '自動',
  '1': '弱',
  '2': '弱+',
  '3': '中',
  '4': '中+',
  '5': '強',
  '6': '強+',
  '7': '最強',
  '8': '最強+',
}

export const DIRECTION_LABELS: Record<string, string> = {
  '': '自動',
  auto: '自動',
  '1': '上',
  '2': '上寄り',
  '3': '中央',
  '4': '下寄り',
  '5': '下',
  swing: 'スイング',
}

export const modeLabel = (v: OperationMode) => MODE_LABELS[v] ?? String(v)
export const volumeLabel = (v: AirVolume) => VOLUME_LABELS[v] ?? String(v)
export const directionLabel = (v: AirDirection) => DIRECTION_LABELS[v] ?? String(v)

export const toOptions = <T extends string>(values: readonly T[], label: (v: T) => string): Option<T>[] =>
  values.map(value => ({ value, label: label(value) }))

export const modeOptions = (values: readonly OperationMode[]) => toOptions(values, modeLabel)
export const volumeOptions = (values: readonly AirVolume[]) => toOptions(values, volumeLabel)
export const directionOptions = (values: readonly AirDirection[]) => toOptions(values, directionLabel)
