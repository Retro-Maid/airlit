import React, { useState, useEffect, useRef, type ReactNode } from 'react'
import { Check, ChevronRight, LoaderCircle, Minus, Play, Plus, Power, type LucideIcon } from 'lucide-react'
import { deviceIcons, deviceStatus, hasPowerSwitch, type AcSettings, type Device } from './types'
import type { Option } from './api/labels'

export function ControlCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) { return <section className="detail-control-card"><h3><Icon />{title}</h3>{children}</section> }

export function ChoicePopover({ label, values, selected, onSelect, onClose }: { label: string; values: { id: string; label: string }[]; selected: string; onSelect: (id: string) => void; onClose: () => void }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <><button className="popover-scrim" aria-label="メニューを閉じる" onClick={onClose} /><div className="choice-popover" role="menu" aria-label={label}><span>{label}</span>{values.map(value => <button key={value.id} className={selected === value.id ? 'selected' : ''} onClick={() => onSelect(value.id)}><span>{value.label}</span>{selected === value.id && <Check />}</button>)}</div></>
}

export function ActionPopover({ items, onClose }: { items: { label: string; action: () => void }[]; onClose: () => void }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <><button className="popover-scrim" aria-label="メニューを閉じる" onClick={onClose} /><div className="action-popover" role="menu">{items.map(item => <button key={item.label} onClick={() => { item.action(); onClose() }}>{item.label}<ChevronRight /></button>)}</div></>
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <div className="empty-state"><span><Icon /></span><strong>{title}</strong><small>{text}</small></div> }

export function PageLayout({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) { return <div className="page"><div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>{children}</div> }

export function PrimaryButton({ icon: Icon, children, onClick }: { icon?: LucideIcon; children: ReactNode; onClick?: () => void }) { return <button className="primary-button" onClick={onClick}>{Icon && <Icon />}{children}</button> }

export function Metric({ icon: Icon, label, value, note, tone }: { icon: LucideIcon; label: string; value: string; note: string; tone: string }) {
  return <article className="metric">
    <div className="metric-head"><Icon className={tone} /><span>{label}</span></div>
    <strong title={value}>{value}</strong>
    <small title={note}>{note}</small>
  </article>
}

export function SectionTitle({ children, onClick }: { children: string; onClick: () => void }) { return <div className="section-title"><h2>{children}</h2><button onClick={onClick}>すべて見る <ChevronRight /></button></div> }

export function SceneRunButton({ title, onRun, className = '' }: { title: string; onRun: () => Promise<unknown> | void; className?: string }) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const timers = useRef<number[]>([])
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false; timers.current.forEach(timer => window.clearTimeout(timer)) }, [])
  const run = async () => {
    if (phase !== 'idle') return
    setPhase('running')
    // the checkmark follows the actual work, not a timer
    try { await onRun() } finally {
      if (!alive.current) return
      setPhase('done')
      timers.current.push(window.setTimeout(() => { if (alive.current) setPhase('idle') }, 1100))
    }
  }
  const label = phase === 'running' ? `${title}を実行中` : phase === 'done' ? `${title}の実行が完了` : `${title}を実行`
  return <button className={`${className} scene-run-button ${phase}`} onClick={() => { void run() }} disabled={phase === 'running'} aria-label={label} aria-busy={phase === 'running'}>{phase === 'running' ? <LoaderCircle /> : phase === 'done' ? <Check /> : <Play fill="currentColor" />}<span className="sr-only" aria-live="polite">{label}</span></button>
}

export function Scene({ icon: Icon, title, description, blue, onClick }: { icon: LucideIcon; title: string; description: string; blue?: boolean; onClick: () => Promise<unknown> | void }) { return <article className="scene"><Icon className={blue ? 'blue' : ''} /><div><strong>{title}</strong><small>{description}</small></div><SceneRunButton title={title} onRun={onClick} /></article> }

export function DeviceCard({ device, ac, selected, pending, onSelect, onToggle, onTemperature }: { device: Device; ac?: AcSettings; selected: boolean; pending?: boolean; onSelect: (id: string) => void; onToggle: (id: string) => void; onTemperature: (delta: number, id: string) => void }) {
  const Icon = deviceIcons[device.type]
  const [head, ...rest] = device.name.split('の')
  const stop = (run: () => void) => (event: React.MouseEvent) => { event.stopPropagation(); run() }
  return <article className={`device ${selected ? 'selected' : ''} ${pending ? 'pending' : ''} ${device.online ? '' : 'offline'}`}
    role="button" tabIndex={0} aria-pressed={selected} aria-label={`${device.name}を選択`}
    onClick={() => onSelect(device.id)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(device.id) } }}>
    <div className="device-head"><Icon /><i /></div>
    <strong>{rest.length ? <>{head}の<br />{rest.join('の')}</> : head}</strong>
    <small>{device.online ? deviceStatus(device, ac) : 'オフライン'}</small>
    <div className="device-controls">
      {hasPowerSwitch(device.type) && <button className={device.power ? 'power on' : 'power'} aria-label={device.power ? '電源をオフ' : '電源をオン'} onClick={stop(() => onToggle(device.id))}><Power /></button>}
      {device.type === 'ac' && <><button aria-label="設定温度を下げる" onClick={stop(() => onTemperature(-1, device.id))}><Minus /></button><button aria-label="設定温度を上げる" onClick={stop(() => onTemperature(1, device.id))}><Plus /></button></>}
    </div>
  </article>
}

export function Tabs({ values, active, onChange }: { values: readonly (string | Option)[]; active: string; onChange: (v: string) => void }) {
  const options = values.map(v => typeof v === 'string' ? { value: v, label: v } : v)
  return <div className="tabs">{options.map(({ value, label }) => <button key={value} className={active === value ? 'active' : ''} aria-pressed={active === value} onClick={() => onChange(value)}>{label}</button>)}</div>
}

export function ControlRow({ icon: Icon, label, ...props }: { icon: LucideIcon; label: string; values: readonly (string | Option)[]; active: string; onChange: (v: string) => void }) { return <div className="control-row"><div className="control-label">{label}</div><div className="control-line"><Icon /><Tabs {...props} /></div></div> }

export function Switch({ defaultOn = false, on: controlledOn, onChange, label = '切り替え' }: { defaultOn?: boolean; on?: boolean; onChange?: (value: boolean) => void; label?: string }) { const [internalOn, setInternalOn] = useState(defaultOn); const isOn = controlledOn ?? internalOn; const toggleSwitch = () => { const next = !isOn; if (controlledOn == null) setInternalOn(next); onChange?.(next) }; return <button type="button" role="switch" aria-checked={isOn} aria-label={label} className={`switch ${isOn ? 'on' : ''}`} onClick={toggleSwitch}><i /></button> }

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) { return <section className="settings-group"><h3>{title}</h3><div>{children}</div></section> }

export function SettingRow({ title, text, children }: { title: string; text: string; children: ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong><span>{text}</span></div>{children}</div> }

export function Shortcut({ label, keys }: { label: string; keys: string[] }) { return <div className="shortcut-row"><span>{label}</span><div>{keys.map(key => <kbd key={key}>{key}</kbd>)}</div></div> }
