import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronUp, Home, LayoutGrid, Lightbulb, Menu, Power, Radio, Tv, Volume2, VolumeX, type LucideIcon } from 'lucide-react'
import { EmptyState } from './ui'
import type { ApplianceButton, Device } from './types'

/**
 * A remote built from the buttons the appliance itself reports.
 *
 * Nature Remo returns `light.buttons` / `tv.buttons` for appliances it recognises, and those
 * are the only buttons that can actually be sent. An earlier version of the TV and light
 * screens rendered a full invented remote — sliders, presets, a "now playing" card — that
 * changed local state and told the user it had been applied without sending anything.
 */

const LABELS: Record<string, string> = {
  // 照明
  on: '点灯', off: '消灯', 'on-100': '全灯', night: '常夜灯', favorite: 'お気に入り',
  'bright-up': '明るく', 'bright-down': '暗く',
  'colortemp-up': '色温度を上げる', 'colortemp-down': '色温度を下げる',
  // テレビ
  power: '電源', mute: '消音', 'vol-up': '音量＋', 'vol-down': '音量−',
  'ch-up': 'チャンネル＋', 'ch-down': 'チャンネル−',
  up: '上', down: '下', left: '左', right: '右', ok: '決定', back: '戻る',
  home: 'ホーム', menu: 'メニュー', display: '画面表示',
  terrestrial: '地上D', bs: 'BS', cs: 'CS',
}

const ICONS: Record<string, LucideIcon> = {
  power: Power, on: Power, off: Power, 'on-100': Lightbulb, night: Lightbulb,
  up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight,
  'vol-up': ChevronUp, 'vol-down': ChevronDown, mute: VolumeX,
  'ch-up': ChevronUp, 'ch-down': ChevronDown,
  home: Home, menu: Menu,
}

/** The appliance's own Japanese label wins; these fill in what the API leaves blank. */
export const buttonLabel = (button: ApplianceButton) =>
  button.label || LABELS[button.name] || button.name

const GROUPS: { title: string; icon: LucideIcon; match: (name: string) => boolean }[] = [
  { title: '電源', icon: Power, match: n => ['power', 'on', 'off', 'on-100', 'night'].includes(n) },
  { title: '明るさ', icon: Lightbulb, match: n => n.startsWith('bright-') || n.startsWith('colortemp-') || n === 'favorite' },
  { title: '音量', icon: Volume2, match: n => n.startsWith('vol-') || n === 'mute' },
  { title: 'チャンネル', icon: Tv, match: n => n.startsWith('ch-') || ['terrestrial', 'bs', 'cs'].includes(n) },
  { title: '入力', icon: LayoutGrid, match: n => n.startsWith('input-') },
  { title: '操作', icon: Radio, match: n => ['up', 'down', 'left', 'right', 'ok', 'back', 'home', 'menu', 'display'].includes(n) },
]

export function ApplianceRemote({ device, buttons, onSend }: {
  device: Device
  buttons: ApplianceButton[]
  onSend: (button: ApplianceButton) => void
}) {
  if (!buttons.length) {
    return <div className="remote-layout single"><section>
      <EmptyState
        icon={Radio}
        title="送信できるボタンがありません"
        text="この家電のボタンを Nature Remo から取得できませんでした。Nature Remo アプリでリモコンを登録し直すと表示されます。"
      />
    </section></div>
  }

  const used = new Set<string>()
  const sections = GROUPS.map(group => {
    const items = buttons.filter(b => !used.has(b.name) && group.match(b.name))
    items.forEach(b => used.add(b.name))
    return { ...group, items }
  }).filter(section => section.items.length > 0)

  const rest = buttons.filter(b => !used.has(b.name))
  if (rest.length) sections.push({ title: 'その他', icon: Radio, match: () => false, items: rest })

  return <div className="remote-layout">
    <section className="remote-groups">
      {sections.map(section => <article key={section.title} className="remote-group">
        <h3><section.icon />{section.title}</h3>
        <div className="remote-buttons">{section.items.map(button => {
          const Icon = ICONS[button.name]
          return <button key={button.name} onClick={() => onSend(button)}>
            {Icon && <Icon />}{buttonLabel(button)}
          </button>
        })}</div>
      </article>)}
    </section>

    <aside className="environment-card remote-about">
      <h3>この家電について</h3>
      <div><Radio /><span>操作方法</span><strong>赤外線</strong></div>
      <div><LayoutGrid /><span>ボタン数</span><strong>{buttons.length}</strong></div>
      <p>
        赤外線の家電は状態を返さないため、{device.name}が実際にどうなったかは取得できません。
        アプリに表示されるのは、送信した操作の記録だけです。
      </p>
    </aside>
  </div>
}
