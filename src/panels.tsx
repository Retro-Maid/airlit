import React, { useState, useEffect, useRef } from 'react'
import { AirVent, AlertTriangle, ArrowLeft, BarChart3, CalendarClock, Check, ChevronRight, Clock3, Droplets, Fan, Gauge, Home, HousePlug, Info, Lightbulb, Minus, Inbox, Moon, MoreHorizontal, PanelTop, Plus, Power, Save, SlidersHorizontal, Sun, Thermometer, Tv, WifiOff, Wind, X, Zap, type LucideIcon , Radio, UserRound} from 'lucide-react'
import { deviceIcons, deviceTypeLabels, type EditorKind, type Device, type AcSettings , type AcCapabilities, type ApplianceButton, acSummary} from './types'
import { newId, type Automation, type Reservation, type Scene, type SceneAction } from './data/library'
import { ActionBuilder } from './ActionBuilder'
import { ReservationForm, ReservationList, FinishedReservations } from './Reservations'
import { ApplianceRemote, buttonLabel } from './Remote'
import { isNotable, KIND_TONES, type JournalEntry } from './data/journal'
import type { Sensors } from './lib/sensors'
import { journalIcon } from './journalIcons'
import { readSeries, statsOf } from './data/history'
import { formatRelative, formatTime } from './lib/format'
import { sceneIconFor } from './sceneIcons'
import { modeOptions, volumeOptions, directionOptions } from './api/labels'
import { ControlCard, ActionPopover, EmptyState, PrimaryButton, Tabs, ControlRow } from './ui'
import { useFocusTrap } from './ui/a11y'

export function Inspector({ selected, capabilities, mode, fan, direction, setMode, setFan, setDirection, changeTemperature, toggle, onOpenDetails, onReserve, onClose, lastOperationAt }: { onReserve: () => void; selected: Device; capabilities: AcCapabilities; mode: string; fan: string; direction: string; setMode: (v: string) => void; setFan: (v: string) => void; setDirection: (v: string) => void; changeTemperature: (n: number) => void; toggle: (id: string) => void; onOpenDetails: () => void; onClose: () => void; lastOperationAt: number | null }) {
  const Icon = deviceIcons[selected.type]
  const [menuOpen, setMenuOpen] = useState(false)
  return <aside className="inspector-wrap"><section key={selected.id} className="inspector"><div className="inspector-tools"><div className="popover-anchor"><button aria-label="デバイスのメニュー" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><MoreHorizontal /></button>{menuOpen && <ActionPopover onClose={() => setMenuOpen(false)} items={[{ label: '詳細を開く', action: onOpenDetails }, { label: '予約する', action: onReserve }]} />}</div><button aria-label="パネルを閉じる" onClick={onClose}><X /></button></div><div className="device-title"><h2>{selected.name}</h2><span>{selected.room || deviceTypeLabels[selected.type]}</span></div>{selected.type === 'ac' ? <><div className="thermostat"><AirVent className="ac-art" /><small>設定温度</small><div className="temperature">{selected.temperature}<sup>°C</sup></div><div className="temperature-controls"><button onClick={() => changeTemperature(-1)}><Minus /></button><button onClick={() => changeTemperature(1)}><Plus /></button></div></div><div className="mode-tabs"><Tabs values={modeOptions(capabilities.modes)} active={mode} onChange={setMode} /></div><ControlRow icon={Fan} label="風量" values={volumeOptions(capabilities.volumes)} active={fan} onChange={setFan} /><ControlRow icon={Wind} label="風向" values={directionOptions(capabilities.directions)} active={direction} onChange={setDirection} /></> : <div className="simple-device-control"><div className="simple-device-art"><Icon /></div><span>現在の状態</span><strong>{selected.power ? 'オン' : 'オフ'}</strong><p>{selected.type === 'ir' ? '赤外線のため状態は取得できません' : deviceTypeLabels[selected.type]}</p></div>}<button className="open-details" onClick={onOpenDetails}>詳細コントロールを開く<ChevronRight /></button><button className={`stop ${selected.power ? 'running' : 'stopped'}`} onClick={() => toggle(selected.id)}><Power />{selected.power ? '運転を停止' : '運転を開始'}</button>{lastOperationAt != null && <div className="last-operation">最終操作 {formatTime(lastOperationAt)}</div>}</section></aside>
}

export function DeviceDetail({ initialTab, device, ac, capabilities, signals, buttons, sensors, kind, reservations, onSendButton, onCreateReservation, onDeleteReservation, onSendSignal, onApplyAc, onClose, onToggle, notify }: { device: Device; kind: string; sensors: Sensors; reservations: Reservation[]; onCreateReservation: (r: Reservation) => void; onDeleteReservation: (id: string) => void; initialTab: string; buttons: ApplianceButton[]; onSendButton: (button: string, label: string) => void; ac: AcSettings; capabilities: AcCapabilities; signals: { id: string; name: string }[]; onSendSignal: (signalId: string, label: string) => void; onApplyAc: (id: string, next: AcSettings & { temperature: number }) => void; onClose: () => void; onToggle: (id: string) => void; notify: (text: string) => void }) {
  const [tab, setTab] = useState(initialTab)
  const [menuOpen, setMenuOpen] = useState(false)
  const Icon = deviceIcons[device.type]
  return <section className="device-detail" aria-label={`${device.name}の詳細`}>
    <header className="detail-header"><button className="detail-back" onClick={onClose}><ArrowLeft />デバイス</button><div className="detail-identity"><span className={`detail-icon ${device.type}`}><Icon /></span><div><h1>{device.name}</h1><span>{[device.room, deviceTypeLabels[device.type]].filter(Boolean).join('・')}</span></div></div><div className="detail-header-actions"><div className="popover-anchor"><button className="secondary-button" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal />その他</button>{menuOpen && <ActionPopover onClose={() => setMenuOpen(false)} items={[{ label: '予約する', action: () => setTab('予約') }]} />}</div>{device.type !== 'energy' && <button className={`detail-power ${device.power ? 'on' : ''}`} onClick={() => onToggle(device.id)}><Power />{device.power ? 'オン' : 'オフ'}</button>}</div></header>
    <nav className="detail-tabs">{['コントロール', '予約', '分析'].map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value === 'コントロール' ? <SlidersHorizontal /> : value === '予約' ? <Clock3 /> : <BarChart3 />}{value}</button>)}</nav>
    <main className="detail-content" key={tab}>
      {tab === 'コントロール' && device.type === 'ac' && <ACDetail device={device} ac={ac} capabilities={capabilities} sensors={sensors} onApply={onApplyAc} notify={notify} />}
      {tab === 'コントロール' && (device.type === 'light' || device.type === 'tv') &&
        <ApplianceRemote device={device} buttons={buttons} onSend={button => { onSendButton(button.name, buttonLabel(button)); notify(`${buttonLabel(button)}を送信しました`) }} />}
      {tab === 'コントロール' && device.type === 'ir' && <IRDetail device={device} signals={signals} onSend={(id, name) => { onSendSignal(id, name); notify(`${name}を送信しました`) }} />}
      {tab === 'コントロール' && device.type === 'energy' && <EnergyDetail device={device} />}
      {tab === '予約' && <ScheduleDetail device={device} ac={ac} signals={signals} reservations={reservations.filter(r => r.deviceId === device.id)} onCreate={onCreateReservation} onDelete={onDeleteReservation} />}
      {tab === '分析' && <AnalyticsDetail device={device} kind={kind} />}
    </main>
  </section>
}

export function ACDetail({ device, ac, capabilities, sensors, onApply, notify }: { device: Device; ac: AcSettings; capabilities: AcCapabilities; sensors: Sensors; onApply: (id: string, next: AcSettings & { temperature: number }) => void; notify: (text: string) => void }) {
  const [temperature, setTemperature] = useState(device.temperature ?? 25)
  const [mode, setMode] = useState<string>(ac.mode)
  const [fan, setFan] = useState<string>(ac.vol)
  const [direction, setDirection] = useState<string>(ac.dir)
  return <div className="control-layout ac-detail"><section className="hero-control"><div className="ambient-ring"><div><AirVent /><span>設定温度</span><strong>{temperature}<sup>°C</sup></strong>{sensors.temperature != null && <small>室温 {sensors.temperature.toFixed(1)}°C</small>}</div></div><div className="hero-stepper"><button onClick={() => setTemperature(v => Math.max(16, v - 1))}><Minus /></button><span>1°C単位</span><button onClick={() => setTemperature(v => Math.min(30, v + 1))}><Plus /></button></div></section><section className="control-stack"><ControlCard title="運転モード" icon={AirVent}><div className="large-segments">{modeOptions(capabilities.modes).map(({ value, label }) => <button key={value} className={mode === value ? 'active' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div></ControlCard><ControlCard title="風量" icon={Fan}><div className="large-segments">{volumeOptions(capabilities.volumes).map(({ value, label }) => <button key={value} className={fan === value ? 'active' : ''} aria-pressed={fan === value} onClick={() => setFan(value)}>{label}</button>)}</div></ControlCard><ControlCard title="風向" icon={Wind}><div className="direction-grid">{directionOptions(capabilities.directions).map(({ value, label }) => <button key={value} className={direction === value ? 'active' : ''} aria-pressed={direction === value} onClick={() => setDirection(value)}>{label}</button>)}</div></ControlCard><button className="apply-control" onClick={() => { const next: AcSettings = { mode: mode as AcSettings["mode"], vol: fan, dir: direction }; onApply(device.id, { ...next, temperature }); notify(`${temperature}°C・${acSummary(next)}に設定しました`) }}><Check />設定を適用</button></section><aside className="environment-card"><h3>現在の環境</h3>{sensors.temperature != null && <div><Thermometer /><span>室温</span><strong>{sensors.temperature.toFixed(1)}°C</strong></div>}{sensors.humidity != null && <div><Droplets /><span>湿度</span><strong>{Math.round(sensors.humidity)}%</strong></div>}{sensors.temperature == null && sensors.humidity == null && <p>この Remo はセンサー値を返していません。</p>}{(sensors.temperature != null || sensors.humidity != null) && <p>Remo のセンサーが計測した値です。</p>}</aside></div>
}


/**
 * 予約 — a one-shot timer for this appliance. Everything here is real: the list is the stored
 * reservations for this device, and a quick button creates one in a single click. The old
 * version of this tab showed invented timers that nothing could act on.
 */
/**
 * 予約 — a one-shot timer for this appliance. The list and the form are shared with the 予約
 * screen in the sidebar, so both places behave identically. The earlier version of this tab
 * showed invented timers that nothing could act on.
 */
export function ScheduleDetail({ device, ac, signals, reservations, onCreate, onDelete }: {
  device: Device
  ac: AcSettings
  signals: { id: string; name: string }[]
  reservations: Reservation[]
  onCreate: (reservation: Reservation) => void
  onDelete: (id: string) => void
}) {
  if (device.type === 'energy') {
    return <div className="schedule-layout single"><section>
      <EmptyState icon={Clock3} title="予約できません" text="スマートメーターは計測専用のため、操作を予約できません。" />
    </section></div>
  }

  return <div className="schedule-layout">
    <section>
      <div className="schedule-heading"><div>
        <h2>予約</h2>
        <p>{device.name}を指定した時刻に1回だけ操作します。繰り返したいときはオートメーションを使ってください。</p>
      </div></div>
      <ReservationList reservations={reservations} onDelete={onDelete} />
      <FinishedReservations reservations={reservations} onDelete={onDelete} />
    </section>

    <aside className="timer-card">
      <Clock3 />
      <h3>かんたん予約</h3>
      <p>操作を選んで時間を押すだけで、1回だけの予約ができます。</p>
      <ReservationForm
        devices={[device]}
        signals={{ [device.id]: signals }}
        acSettings={{ [device.id]: ac }}
        deviceId={device.id}
        onCreate={onCreate}
      />
    </aside>
  </div>
}

export function AnalyticsDetail({ device, kind }: { device: Device; kind: string }) {
  const RANGES = [
    { id: 'all', label: '記録全体', ms: undefined },
    { id: 'hour', label: '直近1時間', ms: 60 * 60 * 1000 },
    { id: 'day', label: '直近24時間', ms: 24 * 60 * 60 * 1000 },
  ] as const
  const [range, setRange] = useState<typeof RANGES[number]['id']>('all')
  const window = RANGES.find(r => r.id === range)?.ms
  const series = readSeries(kind, device, window)
  const stats = statsOf(series)
  const unit = series.unit === 'on' ? '' : series.unit

  // Two points are the minimum that can describe a change over time.
  if (!stats || stats.count < 2) {
    return <div className="analytics-layout">
      <section className="analytics-main">
        <div className="analytics-heading"><div><h2>使用状況</h2><p>このアプリが記録した実測値</p></div></div>
        <div className="empty-state">
          <span><BarChart3 /></span>
          <strong>計測を開始しました</strong>
          <small>アプリを開いている間、約1分ごとに状態を記録します。グラフはデータが貯まると表示されます。</small>
        </div>
      </section>
      <aside className="analytics-summary">
        <h3>記録の状況</h3>
        <article><span>記録済みの点</span><strong>{stats?.count ?? 0}</strong><em>2点以上で表示されます</em></article>
        <article><span>記録する値</span><strong>{device.type === 'energy' ? '瞬時電力' : device.type === 'ac' ? '設定温度' : '電源の状態'}</strong></article>
      </aside>
    </div>
  }

  const values = series.samples.map(s => s.v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const width = 680, height = 250, left = 40, right = 645, top = 25, bottom = 210
  const x = (i: number) => left + (i / (series.samples.length - 1)) * (right - left)
  const y = (v: number) => bottom - ((v - min) / span) * (bottom - top)
  const points = series.samples.map((s, i) => `${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ')
  const round = (n: number) => Math.round(n * 10) / 10

  return <div className="analytics-layout">
    <section className="analytics-main">
      <div className="analytics-heading">
        <div><h2>使用状況</h2><p>このアプリが記録した実測値</p></div>
        <select value={range} onChange={event => setRange(event.target.value as typeof range)}>
          {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <div className="chart-wrap">
        <div className="chart-y"><span>{round(max)}{unit}</span><span>{round((max + min) / 2)}{unit}</span><span>{round(min)}{unit}</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${device.name}の記録`}>
          <defs><linearGradient id={`area-${device.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#20b991" stopOpacity=".35" /><stop offset="1" stopColor="#20b991" stopOpacity="0" />
          </linearGradient></defs>
          <path d={`M ${points} L${right},225 L${left},225 Z`} fill={`url(#area-${device.id})`} />
          <polyline points={points} fill="none" stroke="#14ad84" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="chart-x"><span>{formatTime(stats.first)}</span><span>{formatTime(stats.last)}</span></div>
      </div>
    </section>
    <aside className="analytics-summary">
      <h3>記録のサマリー</h3>
      <article><span>記録期間</span><strong>{formatRelative(stats.first)}<small>から</small></strong><em>{stats.count}点を記録</em></article>
      {series.unit === 'on'
        ? <article><span>オンだった割合</span><strong>{Math.round(stats.onRatio * 100)}<small>%</small></strong><em>記録した点のうち</em></article>
        : <><article><span>平均</span><strong>{round(stats.avg)}<small>{unit}</small></strong></article>
           <article><span>最大 / 最小</span><strong>{round(stats.max)}<small>{unit}</small></strong><em>最小 {round(stats.min)}{unit}</em></article></>}
      <div className="review-note"><Info />Nature のAPIは履歴を返さないため、アプリの起動中に記録した値のみを表示しています。</div>
    </aside>
  </div>
}

/** A corrupted value would leave every notification looking read forever. */
export function readSeenAt(): number {
  const raw = Number(localStorage.getItem('airlit-notices-seen'))
  return Number.isFinite(raw) ? raw : 0
}

export function NotificationCenter({ entries, seenAt, onMarkAll, onClose }: { entries: JournalEntry[]; seenAt: number; onMarkAll: (at: number) => void; onClose: () => void }) {
  const noticeRef = useFocusTrap<HTMLElement>()
  // Only automation runs and failures are worth surfacing here; everything else is in 履歴.
  const items = entries.filter(isNotable).slice(0, 30)
  const unread = items.filter(item => item.at > seenAt).length
  const markAll = () => onMarkAll(Date.now())

  return <><button className="notification-scrim" aria-label="通知を閉じる" onClick={onClose} />
    <aside className="notification-center" role="dialog" aria-modal="true" aria-label="通知" ref={noticeRef}>
      <header>
        <div><h2>通知</h2><span>{unread ? `${unread}件の未読` : '未読はありません'}</span></div>
        {!!unread && <button onClick={markAll}>すべて既読</button>}
      </header>
      <div className="notification-list">
        {items.map(item => <button key={item.id} className={item.at > seenAt ? 'unread' : ''} onClick={markAll}>
          <span className={`notice-icon ${KIND_TONES[item.kind]}`}>{journalIcon(item.kind)}</span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
            <time>{formatRelative(item.at)}</time>
          </span>
          {item.at > seenAt && <i />}
        </button>)}
        {!items.length && <div className="notification-empty"><Inbox /><strong>通知はありません</strong><small>オートメーションの実行や、操作の失敗がここに表示されます。</small></div>}
      </div>
      <footer><Inbox /><span>直近の自動実行とエラーを表示しています</span></footer>
    </aside>
  </>
}

export type RemoUnit = { id: string; name: string; firmware: string; updatedAt: string }

/**
 * Replaces a four-step "searching for your Remo…" flow that never searched for anything —
 * the Cloud API has no discovery. This lists the units the account actually reports.
 */
export function RemoUnitsDialog({ units, sensors, onClose }: { units: RemoUnit[]; sensors: Sensors; onClose: () => void }) {
  const dialogRef = useFocusTrap<HTMLElement>()
  return <div className="setup-backdrop" onMouseDown={onClose}>
    <section className="units-dialog" role="dialog" aria-modal="true" aria-label="接続済みのRemo" ref={dialogRef} onMouseDown={e => e.stopPropagation()}>
      <header>
        <div className="setup-brand"><HousePlug />接続済みのRemo</div>
        <button onClick={onClose} aria-label="閉じる"><X /></button>
      </header>
      <main>
        {units.map(unit => <article key={unit.id} className="unit-row">
          <span className="remo-box"><span /></span>
          <div>
            <strong>{unit.name}</strong>
            <small>ファームウェア {unit.firmware}</small>
            <small>最終更新 {formatRelative(unit.updatedAt)}</small>
          </div>
        </article>)}
        {!units.length && <div className="empty-state"><span><HousePlug /></span><strong>Remo が見つかりません</strong><small>アカウントに Remo が登録されていないか、まだ読み込めていません。</small></div>}

        {!!units.length && <div className="unit-sensors">
          <h4>センサー</h4>
          {sensors.temperature != null && <div><Thermometer /><span>温度</span><strong>{sensors.temperature.toFixed(1)}°C</strong></div>}
          {sensors.humidity != null && <div><Droplets /><span>湿度</span><strong>{Math.round(sensors.humidity)}%</strong></div>}
          {sensors.illumination != null && <div><Sun /><span>明るさ</span><strong>{Math.round(sensors.illumination)}</strong></div>}
          {sensors.movedAt && <div><UserRound /><span>人感</span><strong>{formatRelative(sensors.movedAt)}</strong></div>}
          {sensors.temperature == null && sensors.humidity == null && sensors.illumination == null && !sensors.movedAt &&
            <p className="unit-note">この機種はセンサー値を返しません。</p>}
        </div>}

        <p className="unit-note">Remo 本体の追加やリモコンの学習は Nature Remo アプリで行います。</p>
      </main>
      <footer><button className="primary-button" onClick={onClose}>閉じる</button></footer>
    </section>
  </div>
}

export function EditorDrawer({ kind, devices, capabilities, signals, onClose, onCreateScene, onCreateAutomation, onSave }: { kind: EditorKind; devices: Device[]; capabilities: Record<string, AcCapabilities>; signals: Record<string, { id: string; name: string }[]>; onClose: () => void; onCreateScene: (scene: Scene) => void; onCreateAutomation: (automation: Automation) => void; onSave: (message: string) => void }) {
  const config = {
    scene: { title: 'シーンを作成', description: 'まとめて実行する操作を設定します。', save: 'シーンを保存' },
    automation: { title: 'オートメーションを作成', description: '実行条件と家電の操作を設定します。', save: 'オートメーションを保存' },
  }[kind]
  const [step, setStep] = useState(0)
  const [name, setName] = useState(kind === 'scene' ? '新しいシーン' : '新しいオートメーション')
  const [selectedType, setSelectedType] = useState(kind === 'scene' ? '帰宅' : '時刻')
  const [time, setTime] = useState('07:00')
  const [repeat, setRepeat] = useState('平日')
  const controllable = devices.filter(device => device.type !== 'energy')
  const [actions, setActions] = useState<SceneAction[]>(() =>
    controllable.slice(0, 1).map(device => ({ deviceId: device.id, kind: 'power' as const, power: true })))
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)
  const saveTimer = useRef<number>()
  const nameRef = useRef<HTMLInputElement>(null)
  const drawerRef = useFocusTrap<HTMLElement>()
  useEffect(() => { if (step === 0 && !completed) nameRef.current?.focus({ preventScroll: true }) }, [step, completed])
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])
  const goToStep = (value: number) => { setError(''); setStep(value) }
  const next = () => {
    if (step === 0 && !name.trim()) { setError('名前を入力してください。'); return }
    if (step === 1 && !actions.length) { setError('実行する操作を1つ以上選択してください。'); return }
    setError(''); setStep(value => Math.min(2, value + 1))
  }
  const finish = () => {
    setCompleted(true)
    const chosen: SceneAction[] = actions
    if (kind === 'scene') {
      onCreateScene({
        id: newId('scene'), name: name.trim() || '新しいシーン',
        description: `${chosen.length}台の家電を操作`,
        icon: sceneIconFor(selectedType), color: 'blue', actions: chosen,
      })
    } else if (kind === 'automation') {
      onCreateAutomation({
        id: newId('auto'), name: name.trim() || '新しいオートメーション', enabled: true, lastFiredAt: null,
        trigger: selectedType === '時刻'
          ? { type: 'time', time, repeat: repeat === '毎日' ? 'daily' : repeat === '週末' ? 'weekends' : 'weekdays' }
          : selectedType === 'センサー'
            ? { type: 'sensor', sensor: 'humidity', comparator: 'below', value: 40 }
            : { type: 'location' },
        actions: chosen,
      })
    }
    saveTimer.current = window.setTimeout(() => onSave(`${config.title.replace('を作成', '').replace('を追加', '')}を保存しました`), 700)
  }
  const stepLabels = ['基本設定', kind === 'automation' ? '条件と操作' : '詳細設定', '確認']
  const DeviceTypeIcon = kind === 'scene' ? (selectedType === '就寝' ? Moon : selectedType === '照明' ? Lightbulb : Home) : kind === 'automation' ? (selectedType === 'センサー' ? Thermometer : selectedType === '位置情報' ? WifiOff : CalendarClock) : selectedType === '照明' ? Lightbulb : selectedType === 'テレビ' ? Tv : selectedType === 'その他' ? PanelTop : AirVent
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="editor-drawer" role="dialog" aria-modal="true" aria-label={config.title} ref={drawerRef} onMouseDown={event => event.stopPropagation()}>
    <header><div><span className="drawer-kicker">{kind === 'scene' ? 'SCENE EDITOR' : 'AUTOMATION EDITOR'}</span><h2>{config.title}</h2><p>{config.description}</p></div><button onClick={onClose} aria-label="閉じる"><X /></button></header>
    <div className="editor-steps">{stepLabels.map((label, index) => <React.Fragment key={label}><button className={`${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`} onClick={() => { if (index < step) goToStep(index) }} disabled={index > step}><i>{index < step ? <Check /> : index + 1}</i><span>{label}</span></button>{index < 2 && <b className={index < step ? 'done' : ''} />}</React.Fragment>)}</div>
    <div className="editor-body" key={`${kind}-${step}`}>
      {completed ? <div className="editor-complete"><span><Check /></span><h3>保存しました</h3><p>{name} の設定が完了しました。</p></div> : <>
        {step === 0 && <div className="editor-step-panel"><div className="step-intro"><span>STEP 1</span><h3>基本情報を設定</h3><p>一覧画面で識別しやすい名前と種類を設定します。</p></div><label className={`field ${error ? 'invalid' : ''}`}><span>名前</span><input ref={nameRef} value={name} onChange={event => { setName(event.target.value); setError('') }} placeholder="名前を入力" />{error && <small>{error}</small>}</label>{kind === 'scene' && <div className="field"><span>シーンのアイコン</span><div className="choice-grid three">{[['帰宅', Home], ['就寝', Moon], ['照明', Lightbulb]].map(([label, icon]) => { const Icon = icon as LucideIcon; return <button key={label as string} className={selectedType === label ? 'selected' : ''} onClick={() => setSelectedType(label as string)}><Icon /><strong>{label as string}</strong>{selectedType === label && <Check />}</button> })}</div></div>}{kind === 'automation' && <div className="field"><span>きっかけ</span><div className="choice-grid three">{[['時刻', CalendarClock], ['センサー', Thermometer], ['位置情報', WifiOff]].map(([label, icon]) => { const Icon = icon as LucideIcon; return <button key={label as string} className={selectedType === label ? 'selected' : ''} onClick={() => setSelectedType(label as string)}><Icon /><strong>{label as string}</strong>{selectedType === label && <Check />}</button> })}</div></div>}</div>}
        {step === 1 && kind === 'scene' && <div className="editor-step-panel"><div className="step-intro"><span>STEP 2</span><h3>実行する操作</h3><p>シーンに含める家電を選択してください。</p></div><ActionBuilder devices={controllable} capabilities={capabilities} signals={signals} actions={actions} onChange={next => { setActions(next); setError('') }} />{error && <div className="inline-error"><AlertTriangle />{error}</div>}<label className="field delay-field"><span>操作間隔</span><select defaultValue="同時に実行"><option>同時に実行</option><option>1秒ずつ</option><option>3秒ずつ</option></select></label></div>}
        {step === 1 && kind === 'automation' && <div className="editor-step-panel"><div className="step-intro"><span>STEP 2</span><h3>条件と操作</h3><p>{selectedType}を条件に自動操作を設定します。</p></div>{selectedType === '時刻' && <div className="two-fields"><label className="field"><span>実行時刻</span><input type="time" value={time} onChange={event => setTime(event.target.value)} /></label><label className="field"><span>繰り返し</span><select value={repeat} onChange={event => setRepeat(event.target.value)}><option>毎日</option><option>平日</option><option>週末</option></select></label></div>}{selectedType === 'センサー' && <div className="two-fields"><label className="field"><span>センサー</span><select><option>室温</option><option>湿度</option><option>照度</option></select></label><label className="field"><span>条件</span><select><option>28°C以上</option><option>25°C以下</option></select></label></div>}{selectedType === '位置情報' && <div className="location-rule"><WifiOff /><div><strong>家から離れたとき</strong><small>すべてのメンバーが500m以上離れた場合</small></div></div>}<div className="field"><span>実行する操作</span><ActionBuilder devices={controllable} capabilities={capabilities} signals={signals} actions={actions} onChange={next => { setActions(next); setError('') }} /></div>{error && <div className="inline-error"><AlertTriangle />{error}</div>}</div>}
        {step === 2 && <div className="editor-step-panel review-step"><div className="step-intro"><span>STEP 3</span><h3>設定内容を確認</h3><p>保存後も設定画面から変更できます。</p></div><div className="review-hero"><span><DeviceTypeIcon /></span><div><strong>{name}</strong><small>{kind === 'scene' ? `シーン・${actions.length}件の操作` : `${selectedType}・${actions.length}件の操作`}</small></div></div><dl className="review-list"><div><dt>名前</dt><dd>{name}</dd></div><><div><dt>{kind === 'scene' ? 'アイコン' : 'きっかけ'}</dt><dd>{selectedType}</dd></div>{kind === 'automation' && selectedType === '時刻' && <div><dt>実行</dt><dd>{repeat} {time}</dd></div>}<div><dt>操作</dt><dd>{actions.length}件</dd></div></></dl><div className="review-note"><Info />保存するとすぐに一覧へ反映されます。</div></div>}
      </>}
    </div>
    <footer>{completed ? <span /> : <><button className="secondary-button" onClick={step === 0 ? onClose : () => { setError(''); setStep(value => value - 1) }}>{step === 0 ? 'キャンセル' : '戻る'}</button><div className="drawer-footer-copy"><span>ステップ {step + 1} / 3</span>{step < 2 ? <PrimaryButton icon={ChevronRight} onClick={next}>次へ</PrimaryButton> : <PrimaryButton icon={Save} onClick={finish}>{config.save}</PrimaryButton>}</div></>}</footer>
  </aside></div>
}


/** Generic IR appliance: the Cloud API models these as a bag of learned signals. */
export function IRDetail({ device, signals, onSend }: { device: Device; signals: { id: string; name: string }[]; onSend: (signalId: string, name: string) => void }) {
  return <div className="control-layout ir-detail">
    <section className="hero-control">
      <div className="ir-art"><Radio /></div>
      <strong>{device.name}</strong>
      <span>学習したボタンを送信します</span>
    </section>
    <section className="control-stack">
      <ControlCard title="学習済みのボタン" icon={Radio}>
        {signals.length
          ? <div className="signal-grid">{signals.map(signal =>
              <button key={signal.id} onClick={() => onSend(signal.id, signal.name)}>{signal.name}</button>)}
            </div>
          : <div className="empty-state"><span><Radio /></span><strong>ボタンがまだありません</strong><small>Nature Remo アプリでリモコンを学習させると、ここに表示されます。</small></div>}
      </ControlCard>
    </section>
    <aside className="environment-card">
      <h3>この家電について</h3>
      <div><Radio /><span>種類</span><strong>赤外線リモコン</strong></div>
      <div><Inbox /><span>ボタン数</span><strong>{signals.length}</strong></div>
      <p>赤外線機器は状態を返さないため、送信結果のみ記録されます。</p>
    </aside>
  </div>
}

/** Nature Remo E / E lite. Values come from ECHONET Lite properties on the appliance. */
export function EnergyDetail({ device }: { device: Device }) {
  const watts = device.power_w
  return <div className="control-layout energy-detail">
    <section className="hero-control">
      <div className="ambient-ring"><div>
        <Zap /><span>現在の電力</span>
        <strong>{watts != null ? watts : '—'}<sup>W</sup></strong>
        <small>スマートメーターから取得</small>
      </div></div>
    </section>
    <section className="control-stack">
      <ControlCard title="計測値" icon={Gauge}>
        <dl className="review-list">
          <div><dt>瞬時電力</dt><dd>{watts != null ? watts + ' W' : '取得待ち'}</dd></div>
          <div><dt>更新間隔</dt><dd>約30秒</dd></div>
          <div><dt>取得元</dt><dd>ECHONET Lite</dd></div>
        </dl>
      </ControlCard>
      <div className="review-note"><Info />スマートメーターは表示専用です。操作はできません。</div>
    </section>
    <aside className="environment-card">
      <h3>電力の目安</h3>
      <div><Zap /><span>現在</span><strong>{watts != null ? watts + ' W' : '—'}</strong></div>
      <div><Clock3 /><span>1時間あたり</span><strong>{watts != null ? (watts / 1000).toFixed(2) + ' kWh' : '—'}</strong></div>
      <p>売買電力量は Remo E のプロパティから取得できます。</p>
    </aside>
  </div>
}

/** Entries worth a badge that arrived after the notification centre was last opened. */
export const unreadNotices = (entries: JournalEntry[], seenAt: number) =>
  entries.filter(entry => isNotable(entry) && entry.at > seenAt).length
