import { useRef, useState } from 'react'
import { Activity, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, Droplets, Filter, GripVertical, History, Info, Keyboard, ListFilter, Monitor, Moon, MoreHorizontal, Palette, PanelTop, Plus, Settings, Sun, Trash2, UserRound, WifiOff, Zap, type LucideIcon, Play } from 'lucide-react'
import { type PageId, type ThemeMode, type Device , type AcSettings } from './types'
import { sensorPanels, type Sensors } from './lib/sensors'
import { triggerSummary, type Automation, type Scene as SceneDef } from './data/library'
import { KIND_TONES, type JournalEntry } from './data/journal'
import { dayLabel, formatTime } from './lib/format'
import { journalIcon } from './journalIcons'
import { UpdateCard } from './Updater'
import { sceneIcons } from './sceneIcons'
import { ChoicePopover, ActionPopover, EmptyState, PageLayout, PrimaryButton, Metric, SectionTitle, SceneRunButton, Scene, DeviceCard, Tabs, Switch, SettingsGroup, SettingRow, Shortcut } from './ui'

export function HomeScreen({ devices, selectedId, onSelect, onToggle, onTemperature, onNavigate, notify, acSettings, pending, sensors, scenes, onRunScene }: { devices: Device[]; selectedId: string; onSelect: (id: string) => void; onToggle: (id: string) => void; onTemperature: (delta: number, id: string) => void; onNavigate: (page: PageId) => void; notify: (text: string) => void; acSettings: Record<string, AcSettings>; pending: Record<string, true>; sensors: Sensors; scenes: SceneDef[]; onRunScene: (scene: SceneDef) => Promise<{ done: number; missing: number }> }) {
  const panels = sensorPanels(sensors)
  return <div className="content home-content"><section className="welcome"><h1>おかえりなさい</h1><p>快適な空間で、素敵な時間をお過ごしください。</p></section>{!!panels.length && <section className="metrics">{panels.map(p => <Metric key={p.key} icon={p.icon} label={p.label} value={p.value} note={p.note} tone={p.tone} />)}</section>}<SectionTitle onClick={() => onNavigate('scenes')}>シーン</SectionTitle><section className="scenes">{scenes.slice(0, 3).map(scene => <Scene key={scene.id} icon={sceneIcons[scene.icon]} title={scene.name} description={scene.description} blue={scene.color === 'blue' || scene.color === 'indigo'} onClick={async () => { const r = await onRunScene(scene); notify(r.missing ? `「${scene.name}」を実行しました（${r.missing}件は対象なし）` : `「${scene.name}」シーンを実行しました`) }} />)}</section><SectionTitle onClick={() => onNavigate('devices')}>デバイス</SectionTitle><section className="devices">{devices.map(device => <DeviceCard key={device.id} device={device} ac={acSettings[device.id]} pending={pending[device.id]} selected={selectedId === device.id} onSelect={onSelect} onToggle={onToggle} onTemperature={onTemperature} />)}</section></div>
}

export function DevicesScreen({ devices, selectedId, onSelect, onToggle, onTemperature, onCreate, acSettings, pending, pendingReservations, lastSyncAt }: { pendingReservations: number; lastSyncAt: number | null; devices: Device[]; selectedId: string; onSelect: (id: string) => void; onToggle: (id: string) => void; onTemperature: (delta: number, id: string) => void; onCreate: () => void; acSettings: Record<string, AcSettings>; pending: Record<string, true> }) {
  const lastSyncLabel = lastSyncAt ? `最終更新 ${formatTime(lastSyncAt)}` : '未同期'
  const [room, setRoom] = useState('すべて')
  const [powerFilter, setPowerFilter] = useState<'all' | 'on' | 'off'>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const shown = devices.filter(device => (room === 'すべて' || device.room === room) && (powerFilter === 'all' || device.power === (powerFilter === 'on')))
  const filterLabels = { all: 'すべての状態', on: '運転中のみ', off: '停止中のみ' }
  return <PageLayout title="デバイス" description="家中のデバイスを確認・操作できます。" action={<PrimaryButton icon={Plus} onClick={onCreate}>デバイスを追加</PrimaryButton>}>
    <div className="page-toolbar"><Tabs values={['すべて', 'リビング', '寝室']} active={room} onChange={setRoom} /><div className="popover-anchor"><button className={`secondary-button ${powerFilter !== 'all' ? 'active-filter' : ''}`} onClick={() => setFilterOpen(value => !value)}><Filter />{filterLabels[powerFilter]}<ChevronDown /></button>{filterOpen && <ChoicePopover label="デバイスの状態" values={Object.entries(filterLabels).map(([id, label]) => ({ id, label }))} selected={powerFilter} onSelect={value => { setPowerFilter(value as 'all' | 'on' | 'off'); setFilterOpen(false) }} onClose={() => setFilterOpen(false)} />}</div></div>
    <div className="device-summary"><div><span>登録済み</span><strong>{devices.length}</strong></div><div><span>運転中</span><strong>{devices.filter(device => device.power).length}</strong></div><div><span>予約</span><strong>{pendingReservations}</strong></div><div className="healthy"><Activity /><span>{lastSyncLabel}</span></div></div>
    <section className="devices devices-page">{shown.map(device => <DeviceCard key={device.id} device={device} ac={acSettings[device.id]} pending={pending[device.id]} selected={selectedId === device.id} onSelect={onSelect} onToggle={onToggle} onTemperature={onTemperature} />)}{!shown.length && <EmptyState icon={Filter} title="条件に一致するデバイスがありません" text="部屋または状態フィルターを変更してください。" />}</section>
  </PageLayout>
}

export function ScenesScreen({ notify, onCreate, scenes, onRun, onDelete, missingFor }: { notify: (text: string) => void; onCreate: () => void; scenes: SceneDef[]; onRun: (scene: SceneDef) => Promise<{ done: number; missing: number }>; onDelete: (id: string) => void; missingFor: (scene: SceneDef) => number }) {
  const [sort, setSort] = useState<'default' | 'name' | 'actions'>('default')
  const [sortOpen, setSortOpen] = useState(false)
  const [sceneMenu, setSceneMenu] = useState<string | null>(null)
  const sortedScenes = [...scenes].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ja') : sort === 'actions' ? b.actions.length - a.actions.length : 0)
  const sortLabels = { default: '標準順', name: '名前順', actions: '操作数順' }
  return <PageLayout title="シーン" description="複数の家電をワンタッチでまとめて操作します。" action={<PrimaryButton icon={Plus} onClick={onCreate}>新しいシーン</PrimaryButton>}>
    <div className="page-toolbar"><div className="toolbar-copy"><strong>マイシーン</strong><span>{scenes.length}件</span></div><div className="popover-anchor"><button className={`secondary-button ${sort !== 'default' ? 'active-filter' : ''}`} onClick={() => setSortOpen(value => !value)}><GripVertical />{sortLabels[sort]}<ChevronDown /></button>{sortOpen && <ChoicePopover label="並べ替え" values={Object.entries(sortLabels).map(([id, label]) => ({ id, label }))} selected={sort} onSelect={value => { setSort(value as typeof sort); setSortOpen(false) }} onClose={() => setSortOpen(false)} />}</div></div>
    <section className="scene-library">{sortedScenes.map(scene => { const Icon = sceneIcons[scene.icon]; const missing = missingFor(scene); return <article className="scene-library-card" key={scene.id}><div className={`scene-art ${scene.color}`}><Icon /></div><div className="card-menu-anchor"><button className="more-button" aria-label={`${scene.name}のメニュー`} onClick={() => setSceneMenu(current => current === scene.id ? null : scene.id)}><MoreHorizontal /></button>{sceneMenu === scene.id && <ActionPopover onClose={() => setSceneMenu(null)} items={[{ label: '複製', action: () => notify(`「${scene.name}」を複製しました`) }, { label: '削除', action: () => { onDelete(scene.id); notify(`「${scene.name}」を削除しました`) } }]} />}</div><h3>{scene.name}</h3><p>{scene.description}</p><small>{scene.actions.length}つの操作{missing ? `・${missing}件は対象なし` : ''}</small><div className="card-actions"><button className="secondary-button" onClick={onCreate}>編集</button><SceneRunButton className="round-play" title={scene.name} onRun={() => onRun(scene)} /></div></article> })}
    {!scenes.length && <EmptyState icon={Play} title="シーンがありません" text="「新しいシーン」から、まとめて実行する操作を登録できます。" />}</section>
  </PageLayout>
}

export function AutomationsScreen({ onCreate, automations, onToggle, describeActions, nextRun }: { onCreate: () => void; automations: Automation[]; onToggle: (id: string, enabled: boolean) => void; describeActions: (a: Automation) => string; nextRun: string | null }) {
  const icons = { time: Sun, sensor: Droplets, location: WifiOff }
  const colors = { time: 'yellow', sensor: 'cyan', location: 'blue' }
  return <PageLayout title="オートメーション" description="時間やセンサーを条件に、家電を自動で操作します。" action={<PrimaryButton icon={Plus} onClick={onCreate}>新しいオートメーション</PrimaryButton>}>
    <div className="automation-overview"><div><Zap /><span><strong>{automations.filter(a => a.enabled).length}</strong>件が有効</span></div><p>{nextRun ? `次の実行：${nextRun}` : '予定されている実行はありません'}</p></div>
    <section className="automation-list">{automations.map(row => { const Icon = icons[row.trigger.type]; return <article key={row.id}><div className={`automation-icon ${colors[row.trigger.type]}`}><Icon /></div><div className="automation-main"><strong>{row.name}</strong><span><CalendarClock />{triggerSummary(row.trigger)}</span></div><div className="automation-arrow"><ChevronRight /></div><div className="automation-action"><span>実行内容</span><strong>{describeActions(row)}</strong></div><Switch on={row.enabled} onChange={value => onToggle(row.id, value)} label={`${row.name}を有効にする`} /><button className="more-button" aria-label={`${row.name}のメニュー`} onClick={onCreate}><MoreHorizontal /></button></article> })}
    {!automations.length && <EmptyState icon={Zap} title="オートメーションがありません" text="時刻やセンサーをきっかけに、家電を自動で操作できます。" />}</section>
  </PageLayout>
}

export function HistoryScreen({ entries }: { entries: JournalEntry[] }) {
  const [filter, setFilter] = useState<'all' | 'device' | 'scene' | 'automation'>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const labels = { all: 'すべて', device: '家電の操作', scene: 'シーン', automation: '自動実行' }

  const matches = (entry: JournalEntry) =>
    filter === 'all' ? true
      : filter === 'device' ? entry.kind === 'power' || entry.kind === 'aircon' || entry.kind === 'signal'
      : filter === 'scene' ? entry.kind === 'scene'
      : entry.kind === 'automation'

  // The log is newest-first already; group it under 今日 / 昨日 / a date.
  const groups: { date: string; items: JournalEntry[] }[] = []
  for (const entry of entries.filter(matches)) {
    const date = dayLabel(entry.at)
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.items.push(entry)
    else groups.push({ date, items: [entry] })
  }

  return <PageLayout title="履歴" description="このアプリから行った操作の記録です。" action={<div className="popover-anchor"><button className={`secondary-button ${filter !== 'all' ? 'active-filter' : ''}`} onClick={() => setFilterOpen(value => !value)}><ListFilter />{labels[filter]}<ChevronDown /></button>{filterOpen && <ChoicePopover label="履歴の種類" values={Object.entries(labels).map(([id, label]) => ({ id, label }))} selected={filter} onSelect={value => { setFilter(value as typeof filter); setFilterOpen(false) }} onClose={() => setFilterOpen(false)} />}</div>}>
    <section className="history-panel">
      {groups.map(group => <div className="history-group" key={group.date}>
        <h3>{group.date}</h3>
        {group.items.map(item => <article key={item.id}>
          <time>{formatTime(item.at)}</time>
          <div className={`history-icon ${KIND_TONES[item.kind]}`}>{journalIcon(item.kind)}</div>
          <div><strong>{item.title}</strong><span>{item.detail}</span></div>
          <small>{item.source}</small>
          <ChevronRight />
        </article>)}
      </div>)}
      {!groups.length && <EmptyState icon={History} title={entries.length ? '条件に一致する記録がありません' : 'まだ記録がありません'} text={entries.length ? '別の種類を選んでください。' : 'このアプリから家電を操作すると、ここに記録されます。'} />}
    </section>
  </PageLayout>
}

export function SettingsScreen({ notifyAutomation, setNotifyAutomation, theme, setTheme, reduceMotion, setReduceMotion, compactUi, setCompactUi, openSetup, onReset, demoMode, onAdminGesture, remoUnits, trayOnClose, setTrayOnClose, launchAtLogin, setLaunchAtLogin, connected, account, onConnect, onDisconnect, secureStorage }: { notifyAutomation: boolean; setNotifyAutomation: (value: boolean) => void; theme: ThemeMode; setTheme: (theme: ThemeMode) => void; reduceMotion: boolean; setReduceMotion: (value: boolean) => void; compactUi: boolean; setCompactUi: (value: boolean) => void; openSetup: () => void; onReset: () => void; demoMode: boolean; onAdminGesture: () => void; remoUnits: { id: string; name: string; firmware: string }[]; trayOnClose: boolean; setTrayOnClose: (v: boolean) => void; launchAtLogin: boolean; setLaunchAtLogin: (v: boolean) => void; connected: boolean; account: string | null; onConnect: () => void; onDisconnect: () => void; secureStorage: boolean }) {
  const [section, setSection] = useState('一般')
  // Ten clicks on the logo, without a long pause, reveals the demo-mode switch.
  const taps = useRef(0)
  const tapTimer = useRef<number>()
  const tapLogo = () => {
    window.clearTimeout(tapTimer.current)
    taps.current += 1
    if (taps.current >= 10) { taps.current = 0; onAdminGesture(); return }
    tapTimer.current = window.setTimeout(() => { taps.current = 0 }, 1200)
  }
  const items: [string, LucideIcon][] = [['アカウント', UserRound], ['一般', Settings], ['外観', Palette], ['Remo本体', PanelTop], ['ショートカット', Keyboard], ['アプリ情報', Info]]
  return <div className="settings-layout"><aside className="settings-nav"><div className="page-heading compact"><h1>設定</h1><p>アプリを自分好みに調整します。</p></div>{items.map(([label, Icon]) => <button key={label} className={section === label ? 'active' : ''} onClick={() => setSection(label)}><Icon />{label}<ChevronRight /></button>)}</aside><section className="settings-content"><button className="settings-back"><ChevronLeft />設定</button><h2>{section}</h2>
    {section === 'アカウント' && <SettingsGroup title="Nature アカウント"><div className="account-card"><span className="avatar"><UserRound /></span><div><strong>{demoMode ? 'デモモード' : connected ? (account || '接続済み') : '未接続'}</strong><span className={connected ? '' : 'demo'}>{demoMode ? 'サンプルデータで動作しています（実機には送信されません）' : connected ? (secureStorage ? 'Cloud API に接続中・トークンは OS の保護領域に保存' : 'Cloud API に接続中・トークンはブラウザに保存') : 'アクセストークンを入力すると家電を操作できます'}</span></div>{connected ? <button className="secondary-button" onClick={onDisconnect}>接続を解除</button> : <PrimaryButton onClick={onConnect}>接続する</PrimaryButton>}</div></SettingsGroup>}
    {section === '一般' && <><SettingsGroup title="起動と動作"><SettingRow title="Windowsへのサインイン時に起動" text="バックグラウンドでNature Remoを開始します"><Switch on={launchAtLogin} onChange={setLaunchAtLogin} label="サインイン時に起動" /></SettingRow><SettingRow title="閉じたときにトレイへ格納" text="ウィンドウを閉じても接続を維持します"><Switch on={trayOnClose} onChange={setTrayOnClose} label="トレイへ格納" /></SettingRow></SettingsGroup><SettingsGroup title="通知"><SettingRow title="自動実行をデスクトップ通知する" text="ウィンドウを見ていないときに、オートメーションと予約の実行を通知します"><Switch on={notifyAutomation} onChange={setNotifyAutomation} label="自動実行の通知" /></SettingRow></SettingsGroup></>}
    {section === '外観' && <><SettingsGroup title="テーマ"><div className="theme-options"><button className={theme === 'system' ? 'selected' : ''} onClick={() => setTheme('system')}><Monitor /><strong>システム設定</strong>{theme === 'system' && <Check />}</button><button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')}><Sun /><strong>ライト</strong>{theme === 'light' && <Check />}</button><button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}><Moon /><strong>ダーク</strong>{theme === 'dark' && <Check />}</button></div></SettingsGroup><SettingsGroup title="表示"><SettingRow title="モーションを減らす" text="画面遷移やモーフィングを簡略化します"><Switch on={reduceMotion} onChange={setReduceMotion} label="モーションを減らす" /></SettingRow><SettingRow title="コンパクト表示" text="一覧画面の情報密度を高くします"><Switch on={compactUi} onChange={setCompactUi} label="コンパクト表示" /></SettingRow></SettingsGroup></>}
    {section === 'Remo本体' && <SettingsGroup title="接続済みのRemo">{remoUnits.map(unit => <div className="remo-setting-card" key={unit.id}><div className="remo-box"><span /></div><div><strong>{unit.name}</strong><span>ファームウェア {unit.firmware}</span></div><button className="secondary-button" onClick={openSetup}>詳細</button></div>)}{!remoUnits.length && <div className="remo-setting-card"><div className="remo-box"><span /></div><div><strong>Remo が見つかりません</strong><span>接続するとここに表示されます</span></div></div>}</SettingsGroup>}
    {section === 'ショートカット' && <SettingsGroup title="キーボードショートカット"><Shortcut label="クイック検索" keys={['Ctrl', 'K']} /><Shortcut label="設定を開く" keys={['Ctrl', ',']} /><Shortcut label="画面を閉じる" keys={['Esc']} /></SettingsGroup>}
    {section === 'アプリ情報' && <><div className="about-card"><img className="about-logo" src="/icon.png" alt="" onClick={tapLogo} draggable={false} /><h3>AirLit</h3><p>Version {__APP_VERSION__}・非公式ファンアプリ</p><small>快適な暮らしを、Windowsから。</small><em>Nature Remo 非公式クライアント · MIT License</em></div><SettingsGroup title="アップデート"><UpdateCard /></SettingsGroup></>}
    <div className="settings-footer"><button className="danger-button" onClick={onReset}><Trash2 />設定をリセット</button><span className="settings-autosave">変更はすぐに保存されます</span></div></section></div>
}
