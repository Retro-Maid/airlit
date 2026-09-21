import { useState } from 'react'
import { CalendarClock, Clock3, Power, Trash2, X } from 'lucide-react'
import { newId, reservationAt, untilLabel, type Reservation } from './data/library'
import { deviceIcons, defaultAcSettings, type AcSettings, type Device } from './types'
import { modeLabel } from './api/labels'
import { dayLabel, formatTime } from './lib/format'
import { EmptyState } from './ui'

/** Appliances that can actually be told to do something — a smart meter only measures. */
export const reservable = (devices: Device[]) => devices.filter(device => device.type !== 'energy')

const QUICK_MINUTES = [15, 30, 60, 120] as const

/**
 * Builds a reservation in as few decisions as possible: what to do, then when. The quick
 * buttons commit immediately, so the shortest path is two clicks.
 */
export function ReservationForm({ devices, signals, acSettings, deviceId, onDeviceChange, onCreate }: {
  devices: Device[]
  signals: Record<string, { id: string; name: string }[]>
  acSettings: Record<string, AcSettings>
  deviceId: string
  /** When given, the form shows an appliance picker. */
  onDeviceChange?: (id: string) => void
  onCreate: (reservation: Reservation) => void
}) {
  const [power, setPower] = useState(false)
  const [signalId, setSignalId] = useState('')
  const [time, setTime] = useState(() => {
    const soon = new Date(Date.now() + 3_600_000)
    return `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`
  })

  const device = devices.find(d => d.id === deviceId)
  const buttons = device ? signals[device.id] ?? [] : []
  const usesSignal = device?.type === 'ir' && buttons.length > 0
  // The picker may have moved to another appliance whose buttons are different.
  const chosenSignal = buttons.find(b => b.id === signalId) ?? buttons[0]

  if (!devices.length) {
    return <EmptyState icon={Clock3} title="予約できる家電がありません" text="Nature Remo に接続すると、登録済みの家電を予約できます。" />
  }

  const ac = device ? acSettings[device.id] ?? defaultAcSettings : defaultAcSettings
  const temperature = device?.temperature ?? 25
  const shortLabel = usesSignal ? `「${chosenSignal?.name ?? ''}」` : power ? 'オン' : 'オフ'
  const longLabel = usesSignal
    ? `${shortLabel}を送信`
    : power
      ? device?.type === 'ac' ? `${modeLabel(ac.mode)} ${temperature}°C にする` : 'オンにする'
      : 'オフにする'

  const build = (at: number) => {
    if (!device) return
    const action = usesSignal
      ? chosenSignal
        ? { deviceId: device.id, kind: 'signal' as const, signalId: chosenSignal.id, signalName: chosenSignal.name }
        : null
      : device.type === 'ac' && power
        ? { deviceId: device.id, kind: 'ac' as const, ac, temperature }
        : { deviceId: device.id, kind: 'power' as const, power }
    if (!action) return
    onCreate({
      id: newId('resv'),
      name: `${device.name}を${shortLabel}`,
      at,
      actions: [action],
      deviceId: device.id,
      status: 'pending',
    })
  }

  return <div className="resv-form">
    {onDeviceChange && <label className="resv-field">
      <span>家電</span>
      <select value={deviceId} onChange={event => { onDeviceChange(event.target.value); setSignalId('') }}>
        {devices.map(d => <option key={d.id} value={d.id}>{d.room ? `${d.name}（${d.room}）` : d.name}</option>)}
      </select>
    </label>}

    {usesSignal ? <label className="resv-field">
      <span>送信するボタン</span>
      <select value={chosenSignal?.id ?? ''} onChange={event => setSignalId(event.target.value)}>
        {buttons.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label> : <div className="resv-field">
      <span>操作</span>
      <div className="resv-toggle">
        <button className={power ? '' : 'active off'} onClick={() => setPower(false)}><Power />オフ</button>
        <button className={power ? 'active on' : ''} onClick={() => setPower(true)}><Power />オン</button>
      </div>
    </div>}

    {device && <p className="resv-preview">{device.name}を{longLabel}</p>}

    <div className="timer-options">{QUICK_MINUTES.map(minutes => <button
      key={minutes}
      disabled={!device}
      onClick={() => build(Date.now() + minutes * 60_000)}
    >{minutes < 60 ? `${minutes}分後` : `${minutes / 60}時間後`}</button>)}</div>

    <label className="resv-field">
      <span>時刻を指定</span>
      <input type="time" value={time} onChange={event => setTime(event.target.value)} />
    </label>
    <button
      className="primary-button"
      disabled={!device}
      onClick={() => { const at = reservationAt(time); if (at != null) build(at) }}
    >この時刻に予約</button>
  </div>
}

/** The pending reservations, soonest first. */
export function ReservationList({ reservations, onDelete }: { reservations: Reservation[]; onDelete: (id: string) => void }) {
  const pending = reservations.filter(r => r.status === 'pending').sort((a, b) => a.at - b.at)
  if (!pending.length) {
    return <EmptyState icon={Clock3} title="予約はありません" text="操作と時間を選ぶだけで、1回だけの予約を登録できます。" />
  }
  return <div className="timeline">{pending.map(row => <article key={row.id}>
    <time>{formatTime(row.at)}</time><i />
    <div><strong>{row.name}</strong><span>{dayLabel(row.at)}・{untilLabel(row.at)}</span></div>
    <button className="resv-delete" aria-label={`${row.name}の予約を取り消す`} onClick={() => onDelete(row.id)}><Trash2 /></button>
  </article>)}</div>
}

/** Reservations that already ran, or that were missed because the app was not running. */
export function FinishedReservations({ reservations, onDelete }: { reservations: Reservation[]; onDelete: (id: string) => void }) {
  const finished = reservations.filter(r => r.status !== 'pending').sort((a, b) => b.at - a.at).slice(0, 5)
  if (!finished.length) return null
  return <div className="resv-finished">
    <h3>最近の予約</h3>
    {finished.map(row => <div key={row.id} className={row.status}>
      <span>{formatTime(row.at)}</span>
      <strong>{row.name}</strong>
      <small>{row.status === 'done' ? '実行しました' : 'アプリが起動しておらず実行できませんでした'}</small>
      <button aria-label={`${row.name}の記録を消す`} onClick={() => onDelete(row.id)}><X /></button>
    </div>)}
  </div>
}

/** The 予約 screen in the sidebar — one place for every appliance's one-shot timers. */
export function ReservationsScreen({ devices, signals, acSettings, reservations, onCreate, onDelete }: {
  devices: Device[]
  signals: Record<string, { id: string; name: string }[]>
  acSettings: Record<string, AcSettings>
  reservations: Reservation[]
  onCreate: (reservation: Reservation) => void
  onDelete: (id: string) => void
}) {
  const options = reservable(devices)
  const [deviceId, setDeviceId] = useState(() => options[0]?.id ?? '')
  // The list is keyed by appliance id, which changes when the account does.
  const target = options.find(d => d.id === deviceId) ?? options[0]
  const pendingCount = reservations.filter(r => r.status === 'pending').length

  return <div className="schedule-layout">
    <section>
      <div className="schedule-heading"><div>
        <h2>予約</h2>
        <p>1回だけの操作です。繰り返したいときはオートメーションを使ってください。</p>
      </div><div className="resv-count"><CalendarClock /><span><strong>{pendingCount}</strong>件</span></div></div>
      <ReservationList reservations={reservations} onDelete={onDelete} />
      <FinishedReservations reservations={reservations} onDelete={onDelete} />
    </section>

    <aside className="timer-card">
      <Clock3 />
      <h3>かんたん予約</h3>
      <p>家電と操作を選んで時間を押すだけです。</p>
      <ReservationForm
        devices={options}
        signals={signals}
        acSettings={acSettings}
        deviceId={target?.id ?? ''}
        onDeviceChange={setDeviceId}
        onCreate={onCreate}
      />
      {(() => {
        if (!target) return null
        const mine = reservations.filter(r => r.deviceId === target.id && r.status === 'pending').length
        if (!mine) return null
        const Icon = deviceIcons[target.type]
        return <p className="resv-hint"><Icon />{target.name}には予約が{mine}件あります。</p>
      })()}
    </aside>
  </div>
}
