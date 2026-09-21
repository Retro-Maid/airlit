import { useEffect, useMemo, useState } from 'react'
import { ChevronsUpDown, LoaderCircle, Minus, Plus, PlugZap, Power, WifiOff } from 'lucide-react'
import { CloudAdapter, MockAdapter, UnconfiguredAdapter } from './data/adapter'
import { RemoClient } from './api/client'
import { useRemo as useRemoHome } from './data/useRemo'
import { deviceIcons, deviceStatus, defaultAcSettings, type Device } from './types'
import { openMainWindow, onMiniVisibility } from './desktop/window'
import { loadSession, type Session } from './data/session'

/**
 * The always-on-top companion shown while the main window is minimised or in the tray.
 *
 * It runs in its own webview, so it holds its own copy of the data layer. That is only
 * affordable because the two never poll at the same time: the main window stops polling
 * while it is hidden, and this window is hidden whenever the main one is up.
 */
export function Mini({ initialSession }: { initialSession: Session | null }) {
  // Suspended until this window is actually shown, so it never polls in the background.
  const [visible, setVisible] = useState(false)
  // The session is read once per window at boot, so a token entered in the main window later
  // would never reach here. Re-read it each time this window is brought up.
  const [session, setSession] = useState(initialSession)
  const [demoMode, setDemoMode] = useState(() => localStorage.getItem('airlit-demo-mode') === 'true')
  useEffect(() => onMiniVisibility(shown => {
    setVisible(shown)
    if (!shown) return
    setDemoMode(localStorage.getItem('airlit-demo-mode') === 'true')
    void loadSession().then(value => setSession(value ?? null))
  }), [])

  const adapter = useMemo(
    () => demoMode ? new MockAdapter()
      : session ? new CloudAdapter(new RemoClient(session.token))
      : new UnconfiguredAdapter(),
    [session, demoMode],
  )
  const remo = useRemoHome(adapter, !visible)

  // Smart meters are read-only, so they have nothing to offer here.
  const devices = remo.devices.filter(device => device.type !== 'energy')

  const step = (device: Device, delta: number) => {
    const current = device.temperature
    if (current == null) return
    const temperature = Math.max(16, Math.min(30, current + delta))
    if (temperature === current) return
    remo.setAirCon(device, { ...(remo.acSettings[device.id] ?? defaultAcSettings), temperature })
  }

  return <div className="mini">
    <header className="mini-bar" data-tauri-drag-region>
      <img src="/icon.png" alt="" data-tauri-drag-region />
      <span data-tauri-drag-region>AirLit</span>
      <button className="mini-open" onClick={() => void openMainWindow()} title="AirLit を開く">
        <ChevronsUpDown />
      </button>
    </header>

    <div className="mini-list">
      {remo.status === 'loading' && <div className="mini-note"><LoaderCircle className="spin" />読み込み中…</div>}
      {remo.status === 'offline' && <div className="mini-note"><WifiOff />オフラインです</div>}
      {remo.status === 'error' && <div className="mini-note error">{remo.error}</div>}

      {remo.status === 'ready' && !devices.length && <div className="mini-note">
        <PlugZap />
        {session || demoMode ? '操作できる家電がありません' : 'まだ接続されていません'}
        <button className="mini-note-action" onClick={() => void openMainWindow()}>AirLit を開く</button>
      </div>}

      {remo.status === 'ready' && devices.map(device => {
        const Icon = deviceIcons[device.type]
        const ac = remo.acSettings[device.id]
        const busy = !!remo.pending[device.id]
        return <article key={device.id} className={`mini-row ${device.power ? 'on' : ''} ${busy ? 'busy' : ''}`}>
          <span className="mini-icon"><Icon /></span>
          <div className="mini-copy">
            <strong title={device.name}>{device.name}</strong>
            <small>{deviceStatus(device, ac)}</small>
          </div>
          <div className="mini-step">
            {device.type === 'ac' && device.power && <>
              <button aria-label="設定温度を下げる" onClick={() => step(device, -1)}><Minus /></button>
              <button aria-label="設定温度を上げる" onClick={() => step(device, 1)}><Plus /></button>
            </>}
          </div>
          <button
            className={`mini-power ${device.power ? 'on' : ''}`}
            aria-label={`${device.name}を${device.power ? 'オフ' : 'オン'}にする`}
            aria-pressed={device.power}
            onClick={() => { void remo.setPower(device, !device.power) }}
          >
            <Power />
          </button>
        </article>
      })}
    </div>
  </div>
}
