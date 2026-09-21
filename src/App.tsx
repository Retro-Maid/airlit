import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Bell, Check, ChevronRight, Home, Menu, Minus, Pencil, Search, X } from 'lucide-react'
import { defaultAcSettings, navigation, deviceIcons, type PageId, type EditorKind, type ThemeMode, type AcSettings, deviceStatus } from './types'
import { modeLabel, volumeLabel, directionLabel } from './api/labels'
import { HomeScreen, DevicesScreen, ScenesScreen, AutomationsScreen, HistoryScreen, SettingsScreen } from './screens'
import { MockAdapter, CloudAdapter, UnconfiguredAdapter } from './data/adapter'
import { RemoClient } from './api/client'
import { saveSession, clearSession, usingSecureStorage, type Session } from './data/session'
import { TokenDialog } from './auth'
import { useFocusTrap } from './ui/a11y'
import { useLibrary } from './data/useLibrary'
import { nextRunAt, triggerSummary, type Automation, type SceneAction } from './data/library'
import { appendJournal, readJournal, type JournalEntry } from './data/journal'
import { formatTime } from './lib/format'
import { minimizeWindow, closeWindow, suppressBrowserChrome, onMiniVisibility, isAutostartEnabled, setAutostart, notifyNative } from './desktop/window'
import { SyncStatus, ContentState, SetupPrompt, ConfirmDialog, AddDeviceDialog } from './status'
import { useRemo as useRemoHome } from './data/useRemo'
import { Inspector, DeviceDetail, NotificationCenter, RemoUnitsDialog, EditorDrawer, readSeenAt, unreadNotices } from './panels'
import { ReservationsScreen } from './Reservations'

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * The Cloud API has no name for a home, so this is the app's own label. Editable because the
 * header used to read a fixed "Nature の Home", which is nobody's actual house.
 */
const DEFAULT_HOME_NAME = 'マイホーム'

function HomeName({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    // An empty name would leave the header blank, so it falls back to the previous one.
    onChange(draft.trim() || value)
    setEditing(false)
  }

  if (editing) {
    return <div className="home-selector editing">
      <Home />
      <input
        ref={inputRef}
        value={draft}
        maxLength={24}
        aria-label="家の名前"
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commit() }
          // Escape must not also close the layer underneath.
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(value); setEditing(false) }
        }}
      />
    </div>
  }
  return <button className="home-selector" title="名前を変更" onClick={() => { setDraft(value); setEditing(true) }}>
    <Home /><span>{value}</span><Pencil />
  </button>
}

function App({ initialSession }: { initialSession: Session | null }) {
  const [page, setPage] = useState<PageId>('home')
  const [session, setSession] = useState<Session | null>(initialSession)
  const [account, setAccount] = useState<string | null>(null)
  const [tokenOpen, setTokenOpen] = useState(false)
  const [demoMode, setDemoMode] = useState(() => localStorage.getItem('airlit-demo-mode') === 'true')
  const [demoConfirm, setDemoConfirm] = useState(false)
  const [homeName, setHomeName] = useState(() => localStorage.getItem('airlit-home-name') || DEFAULT_HOME_NAME)
  const adapter = useMemo(
    () => demoMode ? new MockAdapter()
      : session ? new CloudAdapter(new RemoClient(session.token))
      : new UnconfiguredAdapter(),
    [session, demoMode],
  )
  const [miniVisible, setMiniVisible] = useState(false)
  const remo = useRemoHome(adapter, miniVisible)
  const { devices, acSettings } = remo
  const [selectedId, setSelectedId] = useState('')
  const [inspectorClosed, setInspectorClosed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const toastCount = useRef(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const paletteRef = useFocusTrap<HTMLElement>(searchOpen)
  const overlays = useRef({ setup: false, search: false, editor: false, notification: false })
  const [compactNav, setCompactNav] = useState(false)
  const [editor, setEditor] = useState<EditorKind | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('airlit-theme')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('airlit-reduce-motion') === 'true')
  const [compactUi, setCompactUi] = useState(() => localStorage.getItem('airlit-compact-ui') === 'true')
  const [trayOnClose, setTrayOnClose] = useState(() => localStorage.getItem('airlit-tray-on-close') === 'true')
  const [launchAtLogin, setLaunchAtLogin] = useState(() => localStorage.getItem('airlit-launch-at-login') === 'true')
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [noticesSeenAt, setNoticesSeenAt] = useState(readSeenAt)
  const [setupOpen, setSetupOpen] = useState(false)
  const [addDeviceOpen, setAddDeviceOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState('コントロール')
  const openDetail = (id: string, tab = 'コントロール') => { setDetailTab(tab); setDetailId(id) }
  const selected = useMemo(() => devices.find(d => d.id === selectedId) ?? devices[0], [devices, selectedId])
  // The appliance can disappear between polls; the detail screen must close rather than crash.
  const detailDevice = detailId ? devices.find(device => device.id === detailId) : undefined
  const needsHome = page === 'home' || page === 'devices'
  const showInspector = needsHome && !inspectorClosed && !!selected && remo.status === 'ready' && !!devices.length
  const selectedAc = (selected ? acSettings[selected.id] : undefined) ?? defaultAcSettings
  const notify = (text: string) => { toastCount.current += 1; setToast({ id: toastCount.current, text }) }
  const selectDevice = (id: string) => { setSelectedId(id); setInspectorClosed(false) }
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const record = (entry: Parameters<typeof appendJournal>[1]) =>
    setJournal(list => [appendJournal(adapter.kind, entry), ...list].slice(0, 200))
  overlays.current = { setup: setupOpen, search: searchOpen, editor: !!editor, notification: notificationOpen }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); setPage('settings') }
      // Escape closes only the topmost layer. Popovers listen for Escape themselves,
      // so skip the chain while one is open or the layer underneath would close too.
      if (event.key === 'Escape') {
        if (document.querySelector('.choice-popover, .action-popover')) return
        const layers = overlays.current
        if (layers.setup) { setSetupOpen(false); return }
        if (layers.search) { setSearchOpen(false); return }
        if (layers.editor) { setEditor(null); return }
        if (layers.notification) { setNotificationOpen(false); return }
        setDetailId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const update = () => setSystemDark(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  useEffect(() => { localStorage.setItem('airlit-theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('airlit-reduce-motion', String(reduceMotion)) }, [reduceMotion])
  useEffect(() => { localStorage.setItem('airlit-compact-ui', String(compactUi)) }, [compactUi])
  useEffect(() => { localStorage.setItem('airlit-demo-mode', String(demoMode)) }, [demoMode])
  useEffect(() => { localStorage.setItem('airlit-home-name', homeName) }, [homeName])
  useEffect(() => { setJournal(readJournal(adapter.kind)) }, [adapter])
  // Switching connection empties the home (see useRemo), so anything pointing at the old
  // appliances has to go too — otherwise a detail screen or an inspector would linger.
  useEffect(() => {
    setPage('home')
    setDetailId(null)
    setSelectedId('')
    setInspectorClosed(false)
    setEditor(null)
    setSearchOpen(false)
    setQuery('')
  }, [adapter])
  useEffect(() => { localStorage.setItem('airlit-tray-on-close', String(trayOnClose)) }, [trayOnClose])
  useEffect(() => { localStorage.setItem('airlit-launch-at-login', String(launchAtLogin)) }, [launchAtLogin])
  useEffect(() => { void isAutostartEnabled().then(value => { if (value !== null) setLaunchAtLogin(value) }) }, [])
  useEffect(suppressBrowserChrome, [])
  // While the mini controller is on screen it owns the polling budget.
  useEffect(() => onMiniVisibility(setMiniVisible), [])
  useEffect(() => { setSearchIndex(0) }, [query, searchOpen])
  useEffect(() => {
    if (!remo.error || remo.status !== 'ready') return
    notify(remo.error)
    record({ kind: 'error', title: '操作に失敗しました', detail: remo.error, source: 'システム' })
  }, [remo.error, remo.status])
  useEffect(() => {
    if (remo.errorKind !== 'auth' || !session) return
    void clearSession(); setSession(null); setAccount(null); setTokenOpen(true)
  }, [remo.errorKind, session])
  useEffect(() => { if (searchOpen) searchInputRef.current?.focus({ preventScroll: true }) }, [searchOpen])
  // the results list scrolls, so keep the keyboard selection in view
  useEffect(() => { resultsRef.current?.children[searchIndex]?.scrollIntoView({ block: 'nearest' }) }, [searchIndex])

  const changeTemperature = (delta: number, id: string = selected?.id ?? '') => {
    const target = devices.find(device => device.id === id)
    if (!target || target.temperature == null) return
    const temperature = Math.max(16, Math.min(30, target.temperature + delta))
    if (temperature === target.temperature) return
    const ac = acSettings[id] ?? defaultAcSettings
    // optimistic + coalesced: holding ± sends one request, not one per press
    remo.setAirCon(target, { ...ac, temperature })
    notify(`${target.name}を${modeLabel(ac.mode)} ${temperature}°Cにしました`)
    record({ kind: 'aircon', title: target.name, detail: `設定温度を${temperature}°Cに変更`, source: 'アプリから操作', deviceId: target.id })
  }
  const updateAc = (patch: Partial<AcSettings>) => { if (selected) remo.setAirCon(selected, patch) }
  const setMode = (next: string) => {
    const mode = next as AcSettings['mode']
    if (!selected || mode === selectedAc.mode) return
    updateAc({ mode })
    notify(`${selected.name}を${modeLabel(mode)}にしました`)
    record({ kind: 'aircon', title: selected.name, detail: `運転モードを${modeLabel(mode)}に変更`, source: 'アプリから操作', deviceId: selected.id })
  }
  const applyAc = (id: string, next: AcSettings & { temperature: number }) => {
    const target = devices.find(device => device.id === id)
    if (target) remo.setAirCon(target, next)
  }
  const toggle = (id: string) => {
    const target = devices.find(device => device.id === id)
    if (!target) return
    void remo.setPower(target, !target.power)
    notify(`${target.name}を${target.power ? 'オフ' : 'オン'}にしました`)
    record({ kind: 'power', title: target.name, detail: `電源を${target.power ? 'オフ' : 'オン'}`, source: 'アプリから操作', deviceId: target.id })
  }
  const runScene = async (scene: { name: string; actions: SceneAction[] }) => {
    const result = await runActions(scene.actions)
    record({ kind: 'scene', title: scene.name, detail: `${result.done}件の操作を実行`, source: 'シーン' })
    return result
  }
  const runActions = useCallback(async (actions: SceneAction[]) => {
    let done = 0, missing = 0
    for (const action of actions) {
      const target = remo.devices.find(device => device.id === action.deviceId)
      if (!target) { missing += 1; continue }
      if (action.kind === 'power') await remo.setPower(target, action.power)
      else if (action.kind === 'signal') await remo.sendSignal(target, action.signalId)
      else remo.setAirCon(target, { ...action.ac, temperature: action.temperature })
      done += 1
    }
    return { done, missing }
  }, [remo])
  const library = useLibrary(adapter.kind, devices, runActions, (automation, result) => {
    if (result.done === 0) {
      record({ kind: 'error', title: automation.name, detail: '対象の家電が見つからず実行できませんでした', source: '自動実行' })
      return
    }
    const partial = result.missing > 0 ? `（${result.missing}件は対象の家電が見つかりません）` : ''
    notify(`「${automation.name}」を自動実行しました${partial}`)
    record({ kind: 'automation', title: automation.name, detail: `${result.done}件の操作を実行${partial}`, source: '自動実行' })
    if (document.hidden) void notifyNative('オートメーションを実行', `「${automation.name}」を実行しました`)
  }, (reservation, outcome, result) => {
    // A reservation whose moment passed while the app was closed is reported, never run late.
    if (outcome === 'missed') {
      record({ kind: 'error', title: reservation.name, detail: 'アプリが起動しておらず予約を実行できませんでした', source: '予約' })
      return
    }
    if (result.done === 0) {
      record({ kind: 'error', title: reservation.name, detail: '対象の家電が見つからず予約を実行できませんでした', source: '予約' })
      return
    }
    notify(`予約「${reservation.name}」を実行しました`)
    record({ kind: 'automation', title: reservation.name, detail: '予約を実行', source: '予約' })
    if (document.hidden) void notifyNative('予約を実行', `「${reservation.name}」を実行しました`)
  })
  // Finished reservations have already been reported in 履歴, so they are not kept between runs.
  useEffect(() => { library.clearFinishedReservations() }, [adapter.kind])
  const missingFor = (scene: { actions: SceneAction[] }) =>
    scene.actions.filter(a => !devices.some(d => d.id === a.deviceId)).length
  const describeActions = (automation: Automation) => {
    const first = automation.actions[0]
    if (!first) return '操作なし'
    const target = devices.find(d => d.id === first.deviceId)
    const name = target?.name ?? '対象なし'
    const rest = automation.actions.length - 1
    const what = first.kind === 'power' ? (first.power ? 'をオン' : 'をオフ')
      : first.kind === 'signal' ? `で「${first.signalName}」を送信`
      : 'を設定'
    return `${name}${what}${rest > 0 ? ` ほか${rest}件` : ''}`
  }
  // Reservations have their own screen, so this line covers automations only.
  const nextRun = (() => {
    const candidates: { at: number; label: string }[] = []
    for (const automation of library.automations) {
      const at = nextRunAt(automation)
      if (at != null) candidates.push({ at, label: `${automation.name}　${triggerSummary(automation.trigger)}` })
    }
    if (!candidates.length) return null
    return candidates.sort((a, b) => a.at - b.at)[0].label
  })()
  const runTransition = (commit: () => void) => {
    const viewDocument = document as Document & { startViewTransition?: (callback: () => void) => void }
    // flushSync is required: startViewTransition snapshots the DOM right after the callback
    // returns, and React would otherwise still have the state update batched.
    if (!reduceMotion && !reducedMotionQuery.matches && viewDocument.startViewTransition) viewDocument.startViewTransition(() => flushSync(commit))
    else commit()
  }
  const navigate = (next: PageId) => runTransition(() => { setPage(next); setSearchOpen(false); setQuery(''); setDetailId(null) })
  const searchItems = useMemo(() => searchOpen ? [
    ...navigation.map(item => ({ id: item.id, title: item.label, caption: '画面を開く', icon: item.icon, action: () => navigate(item.id) })),
    ...devices.map(device => ({ id: device.id, title: device.name, caption: `${device.room}・${deviceStatus(device, acSettings[device.id])}`, icon: deviceIcons[device.type], action: () => { selectDevice(device.id); navigate('devices') } })),
  ].filter(item => `${item.title}${item.caption}`.toLowerCase().includes(query.toLowerCase())) : [], [searchOpen, query, devices])
  const handleSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSearchIndex(index => Math.min(searchItems.length - 1, index + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex(index => Math.max(0, index - 1)) }
    if (event.key === 'Enter' && searchItems[searchIndex]) { event.preventDefault(); searchItems[searchIndex].action() }
  }

  const unread = unreadNotices(journal, noticesSeenAt)
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  return <div className={`desktop ${dark ? 'theme-dark' : ''} ${showInspector ? '' : 'without-inspector'} ${compactNav ? 'nav-compact' : ''} ${reduceMotion ? 'reduce-motion' : ''} ${compactUi ? 'compact-ui' : ''}`}>
    <div className="windows-titlebar" data-tauri-drag-region><div className="titlebar-app" data-tauri-drag-region><img className="app-mark-icon" src="/icon.png" alt="" />AirLit</div><div className="window-actions"><button aria-label="最小化" onClick={() => void minimizeWindow()}><Minus /></button><button className="close" aria-label="閉じる" onClick={() => void closeWindow(trayOnClose)}><X /></button></div></div>
    <aside className="sidebar"><div className="brand"><img className="brand-symbol" src="/icon.png" alt="" /><span>AirLit</span><button className="nav-collapse" onClick={() => setCompactNav(v => !v)} aria-label="ナビゲーションを切り替え" aria-expanded={!compactNav}><Menu /></button></div><nav aria-label="メインナビゲーション">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)} title={label}><Icon /><span>{label}</span></button>)}</nav><button className="remo-status" onClick={() => session || demoMode ? setSetupOpen(true) : setTokenOpen(true)}><span className="remo-box"><span /></span><span className="remo-copy"><strong>{demoMode ? 'デモモード' : session ? 'Nature Remo' : '未接続'}</strong><small><i className={session || demoMode ? '' : 'off'} />{demoMode ? 'サンプル' : session ? '接続中' : '接続する'}</small></span><ChevronRight /></button></aside>
    <main className="main"><header className="topbar"><HomeName value={homeName} onChange={setHomeName} /><div className="header-right"><button className="header-icon" aria-label="検索" onClick={() => setSearchOpen(true)}><Search /></button><button className={`header-icon notification ${notificationOpen ? 'active' : ''}`} aria-label="通知" aria-expanded={notificationOpen} onClick={() => setNotificationOpen(v => !v)}><Bell />{unread > 0 && <i />}</button><div className="divider" /><SyncStatus connected={!!session} demo={demoMode} status={remo.status} error={remo.error} errorKind={remo.errorKind} lastSyncAt={remo.lastSyncAt} limiter={remo.limiter} onRetry={() => { void remo.refresh() }} /></div></header>
      {needsHome && remo.status !== 'ready' && <ContentState status={remo.status} error={remo.error} onRetry={() => { void remo.refresh() }} />}
      {needsHome && remo.status === 'ready' && !devices.length &&
        <SetupPrompt connected={!!session} demo={demoMode} onConnect={() => setTokenOpen(true)} onRetry={() => { void remo.refresh() }} />}
      {page === 'home' && remo.status === 'ready' && !!devices.length && <HomeScreen devices={devices} selectedId={selectedId} onSelect={selectDevice} onToggle={toggle} onTemperature={changeTemperature} acSettings={acSettings} pending={remo.pending} sensors={remo.sensors} onNavigate={navigate} notify={notify} scenes={library.scenes} onRunScene={runScene} />}
      {page === 'devices' && remo.status === 'ready' && !!devices.length && <DevicesScreen devices={devices} selectedId={selectedId} onSelect={selectDevice} onToggle={toggle} onTemperature={changeTemperature} acSettings={acSettings} pending={remo.pending} onCreate={() => setAddDeviceOpen(true)} pendingReservations={library.reservations.filter(r => r.status === 'pending').length} lastSyncAt={remo.lastSyncAt} />}
      {page === 'scenes' && <ScenesScreen notify={notify} onCreate={() => setEditor('scene')} scenes={library.scenes} onRun={runScene} onDelete={library.removeScene} missingFor={missingFor} />}{page === 'automations' && <AutomationsScreen onCreate={() => setEditor('automation')} automations={library.automations} onToggle={library.setAutomationEnabled} describeActions={describeActions} nextRun={nextRun} />}
      {page === 'reservations' && <ReservationsScreen devices={devices} signals={remo.signals} acSettings={acSettings} reservations={library.reservations} onCreate={reservation => { library.addReservation(reservation); notify(`${formatTime(reservation.at)}に「${reservation.name}」を予約しました`) }} onDelete={library.removeReservation} />}
      {page === 'history' && <HistoryScreen entries={journal} />}{page === 'settings' && <SettingsScreen theme={theme} setTheme={setTheme} reduceMotion={reduceMotion} setReduceMotion={setReduceMotion} compactUi={compactUi} setCompactUi={setCompactUi} trayOnClose={trayOnClose} setTrayOnClose={setTrayOnClose} launchAtLogin={launchAtLogin} setLaunchAtLogin={value => {
        setLaunchAtLogin(value)
        void setAutostart(value).then(actual => { if (actual !== null && actual !== value) { setLaunchAtLogin(actual); notify('自動起動の設定を変更できませんでした') } })
      }} openSetup={() => setSetupOpen(true)} demoMode={demoMode} onAdminGesture={() => setDemoConfirm(true)} remoUnits={remo.remoUnits} connected={!!session} account={account} onConnect={() => setTokenOpen(true)} onDisconnect={() => { void clearSession(); setSession(null); setAccount(null); notify('接続を解除しました') }} secureStorage={usingSecureStorage()} onReset={() => { setTheme('system'); setReduceMotion(false); setCompactUi(false); notify('設定を初期状態に戻しました') }} />}
    </main>
    {showInspector && <Inspector selected={selected} capabilities={remo.capabilitiesFor(selected.id)} mode={selectedAc.mode} fan={selectedAc.vol} direction={selectedAc.dir} setMode={setMode} setFan={value => { if (value !== selectedAc.vol) { updateAc({ vol: value }); notify(`風量を${volumeLabel(value)}にしました`) } }} setDirection={value => { if (value !== selectedAc.dir) { updateAc({ dir: value }); notify(`風向を${directionLabel(value)}にしました`) } }} changeTemperature={changeTemperature} toggle={toggle} onOpenDetails={() => openDetail(selected.id)} onReserve={() => openDetail(selected.id, '予約')} onClose={() => setInspectorClosed(true)} lastOperationAt={journal.find(e => e.deviceId === selected.id)?.at ?? null} />}
    {detailDevice && <DeviceDetail initialTab={detailTab} device={detailDevice} ac={acSettings[detailDevice.id] ?? defaultAcSettings} capabilities={remo.capabilitiesFor(detailDevice.id)} signals={remo.signals[detailDevice.id] ?? []} buttons={remo.buttons[detailDevice.id] ?? []} onSendButton={(button, label) => { void remo.sendButton(detailDevice, button); record({ kind: 'signal', title: detailDevice.name, detail: `${label}を送信`, source: 'リモコン', deviceId: detailDevice.id }) }} kind={adapter.kind} sensors={remo.sensors} reservations={library.reservations} onCreateReservation={reservation => { library.addReservation(reservation); notify(`${formatTime(reservation.at)}に「${reservation.name}」を予約しました`) }} onDeleteReservation={library.removeReservation} onSendSignal={(signalId, label) => { void remo.sendSignal(detailDevice, signalId); record({ kind: 'signal', title: detailDevice.name, detail: `${label}を送信`, source: 'リモコン', deviceId: detailDevice.id }) }} onApplyAc={applyAc} onClose={() => setDetailId(null)} onToggle={toggle} notify={notify} />}
    {searchOpen && <div className="command-backdrop" onMouseDown={() => setSearchOpen(false)}><section className="command-palette" role="dialog" aria-modal="true" aria-label="検索" ref={paletteRef} onMouseDown={e => e.stopPropagation()}><div className="command-input"><Search /><input ref={searchInputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleSearchKey} placeholder="画面やデバイスを検索…" /><kbd>ESC</kbd></div><div className="command-results" ref={resultsRef}>{searchItems.map(({ id, title, caption, icon: Icon, action }, index) => <button key={id} className={searchIndex === index ? 'active' : ''} onMouseEnter={() => setSearchIndex(index)} onClick={action}><Icon /><span><strong>{title}</strong><small>{caption}</small></span><ChevronRight /></button>)}{!searchItems.length && <div className="no-results"><Search /><strong>一致する項目がありません</strong><span>別のキーワードを入力してください。</span></div>}</div><footer><span><kbd>↑</kbd><kbd>↓</kbd> 選択</span><span><kbd>Enter</kbd> 開く</span></footer></section></div>}
    {editor && <EditorDrawer kind={editor} devices={devices} capabilities={remo.capabilities} signals={remo.signals} onClose={() => setEditor(null)} onCreateScene={library.addScene} onCreateAutomation={library.addAutomation} onSave={message => { setEditor(null); notify(message) }} />}
    {addDeviceOpen && <AddDeviceDialog
      onClose={() => setAddDeviceOpen(false)}
      onRefresh={() => { setAddDeviceOpen(false); void remo.refresh() }}
    />}
    {notificationOpen && <NotificationCenter entries={journal} seenAt={noticesSeenAt} onMarkAll={at => { try { localStorage.setItem('airlit-notices-seen', String(at)) } catch { /* private mode */ } setNoticesSeenAt(at) }} onClose={() => setNotificationOpen(false)} />}
    {demoConfirm && <ConfirmDialog
      title={demoMode ? 'デモモードを解除しますか？' : 'デモモードへの切り替えをしますか？'}
      body={demoMode
        ? 'サンプルデータの表示をやめて、通常の接続に戻します。'
        : '実際の家電の代わりにサンプルデータを表示します。操作は実機には送信されません。'}
      confirmLabel={demoMode ? '解除する' : '切り替える'}
      onCancel={() => setDemoConfirm(false)}
      onConfirm={() => {
        setDemoMode(value => !value)
        setDemoConfirm(false)
        notify(demoMode ? 'デモモードを解除しました' : 'デモモードに切り替えました')
      }}
    />}
    {tokenOpen && <TokenDialog onClose={() => setTokenOpen(false)} onConnected={(token, nickname) => { void saveSession(token).then(setSession); setAccount(nickname); setTokenOpen(false); notify(`接続しました${nickname ? '（' + nickname + '）' : ''}`) }} />}
    {setupOpen && <RemoUnitsDialog units={remo.remoUnits} sensors={remo.sensors} onClose={() => setSetupOpen(false)} />}
    {toast && <div className="toast" key={toast.id} role="status" aria-live="polite"><Check />{toast.text}</div>}
  </div>
}

export default App
