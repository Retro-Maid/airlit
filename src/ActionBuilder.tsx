import { Check, Minus, Plus, Power } from 'lucide-react'
import { modeOptions } from './api/labels'
import { defaultAcCapabilities, deviceIcons, type AcCapabilities, type AcSettings, type Device } from './types'
import type { SceneAction } from './data/library'

const AC_MIN = 16
const AC_MAX = 30

/**
 * Lets each appliance in a scene or automation carry its own command, instead of every
 * selected device simply being switched on. What can be chosen depends on the appliance:
 * an air conditioner gets a mode and a temperature, an infrared appliance gets one of its
 * learned buttons, everything else gets on/off.
 */
export function ActionBuilder({ devices, capabilities, signals, actions, onChange }: {
  devices: Device[]
  capabilities: Record<string, AcCapabilities>
  signals: Record<string, { id: string; name: string }[]>
  actions: SceneAction[]
  onChange: (actions: SceneAction[]) => void
}) {
  const find = (id: string) => actions.find(a => a.deviceId === id)

  const replace = (id: string, action: SceneAction | null) => {
    const rest = actions.filter(a => a.deviceId !== id)
    onChange(action ? [...rest, action] : rest)
  }

  const defaultFor = (device: Device): SceneAction => {
    if (device.type === 'ir') {
      const first = signals[device.id]?.[0]
      return first
        ? { deviceId: device.id, kind: 'signal', signalId: first.id, signalName: first.name }
        : { deviceId: device.id, kind: 'power', power: true }
    }
    return { deviceId: device.id, kind: 'power', power: true }
  }

  return <div className="action-builder-rich">
    {devices.map(device => {
      const Icon = deviceIcons[device.type]
      const action = find(device.id)
      const selected = !!action
      const caps = capabilities[device.id] ?? defaultAcCapabilities
      const buttons = signals[device.id] ?? []

      return <article key={device.id} className={`ab-row ${selected ? 'selected' : ''}`}>
        <button
          className="ab-head"
          aria-pressed={selected}
          onClick={() => replace(device.id, selected ? null : defaultFor(device))}
        >
          <span className="ab-icon"><Icon /></span>
          <span className="ab-name"><strong>{device.name}</strong><small>{device.room}</small></span>
          <span className="ab-check">{selected ? <Check /> : <Plus />}</span>
        </button>

        {selected && <div className="ab-config">
          {device.type === 'ir' && buttons.length > 0 ? (
            <label className="ab-field">
              <span>送信するボタン</span>
              <select
                value={action.kind === 'signal' ? action.signalId : ''}
                onChange={event => {
                  const chosen = buttons.find(b => b.id === event.target.value)
                  if (chosen) replace(device.id, { deviceId: device.id, kind: 'signal', signalId: chosen.id, signalName: chosen.name })
                }}
              >
                {buttons.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          ) : <>
            <div className="ab-field">
              <span>電源</span>
              <div className="ab-toggle">
                <button
                  className={action.kind === 'power' && !action.power ? 'active off' : ''}
                  onClick={() => replace(device.id, { deviceId: device.id, kind: 'power', power: false })}
                ><Power />オフ</button>
                <button
                  className={action.kind !== 'power' || action.power ? 'active on' : ''}
                  onClick={() => replace(device.id, device.type === 'ac'
                    ? { deviceId: device.id, kind: 'ac', ac: { mode: caps.modes[0] ?? 'cool' }, temperature: 25 }
                    : { deviceId: device.id, kind: 'power', power: true })}
                ><Power />オン</button>
              </div>
            </div>

            {device.type === 'ac' && action.kind === 'ac' && <>
              <label className="ab-field">
                <span>運転モード</span>
                <select
                  value={action.ac.mode ?? ''}
                  onChange={event => replace(device.id, { ...action, ac: { ...action.ac, mode: event.target.value as AcSettings['mode'] } })}
                >
                  {modeOptions(caps.modes).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <div className="ab-field">
                <span>設定温度</span>
                <div className="ab-temp">
                  <button
                    aria-label="設定温度を下げる"
                    onClick={() => replace(device.id, { ...action, temperature: Math.max(AC_MIN, (action.temperature ?? 25) - 1) })}
                  ><Minus /></button>
                  <strong>{action.temperature ?? 25}°C</strong>
                  <button
                    aria-label="設定温度を上げる"
                    onClick={() => replace(device.id, { ...action, temperature: Math.min(AC_MAX, (action.temperature ?? 25) + 1) })}
                  ><Plus /></button>
                </div>
              </div>
            </>}
          </>}
        </div>}
      </article>
    })}

    {!devices.length && <p className="ab-empty">操作できる家電がありません。</p>}
  </div>
}
