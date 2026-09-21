import { AlertTriangle, Cloud, CloudOff, FlaskConical, KeyRound, LoaderCircle, PackagePlus, PlugZap, RotateCw, ShieldCheck, Timer } from 'lucide-react'
import { formatSeconds, formatTime } from './lib/format'
import type { RemoState } from './data/useRemo'
import { X, Info } from 'lucide-react'
import { useFocusTrap } from './ui/a11y'

type Props = Pick<RemoState, 'status' | 'error' | 'errorKind' | 'lastSyncAt' | 'limiter'> & {
  connected: boolean
  demo: boolean
  onRetry: () => void
}

/** Replaces the hardcoded "同期済み / 最終更新 12:48" with the real connection state. */
export function SyncStatus({ connected, demo, status, error, errorKind, lastSyncAt, limiter, onRetry }: Props) {
  // Without an account there is nothing to sync, so saying 同期済み would be a lie.
  if (!connected && !demo) {
    return <div className="sync-status idle">
      <span className="sync-mark"><PlugZap className="cloud" /></span>
      <div className="sync-copy"><strong>未接続</strong><small>アクセストークンが未設定です</small></div>
    </div>
  }
  if (demo) {
    return <div className="sync-status demo">
      <span className="sync-mark"><FlaskConical className="cloud" /></span>
      <div className="sync-copy"><strong>デモモード</strong><small>サンプルデータを表示中</small></div>
    </div>
  }

  const throttled = errorKind === 'rate-limit' || (limiter?.pausedUntil != null && limiter.pausedUntil > Date.now())
  const tone = status === 'ready' ? (throttled ? 'warn' : 'ok') : status === 'loading' ? 'busy' : 'error'

  const Icon = status === 'offline' ? CloudOff
    : status === 'error' ? AlertTriangle
    : throttled ? Timer
    : status === 'loading' ? LoaderCircle
    : Cloud

  const title = status === 'loading' ? '同期中'
    : status === 'offline' ? 'オフライン'
    : status === 'error' ? '同期できません'
    : throttled ? '通信を制限中'
    : '同期済み'

  const detail = status === 'loading' ? 'デバイスを読み込んでいます'
    : status === 'offline' ? 'ネットワークを待っています'
    : status === 'error' ? (error ?? '再試行してください')
    : throttled && limiter?.pausedUntil
      ? `${formatSeconds(limiter.pausedUntil - Date.now())}後に再開します`
      : lastSyncAt ? `最終更新 ${formatTime(lastSyncAt)}` : '未同期'

  const budget = limiter && limiter.remaining != null && limiter.limit != null
    ? `${limiter.remaining}/${limiter.limit}`
    : null

  return <div className={`sync-status ${tone}`}>
    <span className="sync-mark">
      <Icon className={`cloud ${status === 'loading' ? 'spinning' : ''}`} />
      <span className="sync-dot" />
    </span>
    <div className="sync-copy">
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
    {budget && <span className="sync-budget" title={`この5分間に使えるリクエストの残り: ${budget}`}>{budget}</span>}
    {(status === 'error' || status === 'offline') &&
      <button className="sync-retry" onClick={onRetry} aria-label="再試行"><RotateCw /></button>}
  </div>
}

/** Full-area states for the main content region. */
export function ContentState({ status, error, onRetry }: { status: 'loading' | 'error' | 'offline'; error?: string | null; onRetry: () => void }) {
  if (status === 'loading') {
    return <div className="content-state" role="status" aria-live="polite">
      <span className="state-icon busy"><LoaderCircle /></span>
      <strong>デバイスを読み込んでいます</strong>
      <small>Nature Remo に接続しています…</small>
    </div>
  }
  return <div className="content-state" role="alert">
    <span className="state-icon error">{status === 'offline' ? <CloudOff /> : <AlertTriangle />}</span>
    <strong>{status === 'offline' ? 'オフラインです' : '読み込めませんでした'}</strong>
    <small>{error ?? 'ネットワーク接続を確認してください。'}</small>
    <button className="primary-button" onClick={onRetry}><RotateCw />再試行</button>
  </div>
}

/** Shown when the app has nothing to control yet, so the next step is obvious. */
export function SetupPrompt({ connected, demo, onConnect, onRetry }: {
  connected: boolean
  demo: boolean
  onConnect: () => void
  onRetry: () => void
}) {
  if (!connected && !demo) {
    return <div className="content-state setup" role="status">
      <span className="state-icon link"><PlugZap /></span>
      <strong>Nature Remo に接続しましょう</strong>
      <small>
        アクセストークンを入力すると、ご自宅の家電がここに並びます。<br />
        トークンは Nature のアカウントページで発行できます。
      </small>
      <button className="primary-button" onClick={onConnect}><KeyRound />接続する</button>
    </div>
  }
  return <div className="content-state setup" role="status">
    <span className="state-icon link"><PackagePlus /></span>
    <strong>操作できる家電がありません</strong>
    <small>
      アカウントに家電が登録されていないようです。<br />
      Nature Remo アプリでリモコンを登録してから、再読み込みしてください。
    </small>
    <button className="secondary-button" onClick={onRetry}><RotateCw />再読み込み</button>
  </div>
}

/** A small confirmation used by the hidden admin gesture. */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return <div className="setup-backdrop" onMouseDown={onCancel}>
    <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}>
      <span className="confirm-mark"><ShieldCheck /></span>
      <h3>{title}</h3>
      <p>{body}</p>
      <footer>
        <button className="secondary-button" onClick={onCancel}>キャンセル</button>
        <button className="primary-button" onClick={onConfirm}>{confirmLabel}</button>
      </footer>
    </section>
  </div>
}

/**
 * Registering an appliance is not something the Cloud API can do — remotes are learned in the
 * Nature Remo app itself. The button used to open a wizard that asked for a maker and a preset,
 * sent a fake test signal and then saved nothing at all.
 */
export function AddDeviceDialog({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const ref = useFocusTrap<HTMLElement>()
  return <div className="command-backdrop" onMouseDown={onClose}>
    <section className="setup-dialog compact" role="dialog" aria-modal="true" aria-label="家電を追加" ref={ref} onMouseDown={event => event.stopPropagation()}>
      <header><div><h2>家電を追加するには</h2><p>リモコンの学習は Nature Remo アプリで行います。</p></div>
        <button onClick={onClose} aria-label="閉じる"><X /></button></header>
      <main>
        <ol className="add-device-steps">
          <li><strong>Nature Remo アプリを開く</strong><span>スマートフォンの公式アプリで家電を登録します。</span></li>
          <li><strong>リモコンを学習させる</strong><span>登録した家電は同じアカウントから読み込めます。</span></li>
          <li><strong>AirLit を再読み込みする</strong><span>下のボタンで最新の家電一覧を取得します。</span></li>
        </ol>
        <p className="add-device-note">
          <Info />AirLit は Nature Remo の非公式クライアントです。家電の登録や削除には対応していません。
        </p>
      </main>
      <footer>
        <button className="secondary-button" onClick={onClose}>閉じる</button>
        <button className="primary-button" onClick={onRefresh}><RotateCw />家電を再読み込み</button>
      </footer>
    </section>
  </div>
}
