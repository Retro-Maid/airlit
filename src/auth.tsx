import { useState } from 'react'
import { AlertTriangle, ExternalLink, KeyRound, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { RemoClient } from './api/client'
import { RemoApiError } from './api/types'
import { useFocusTrap } from './ui/a11y'
import { openExternal, isDesktop } from './desktop/window'

const TOKEN_PAGE = 'https://home.nature.global/'

/** Asks for a Cloud API access token and verifies it against /1/users/me before saving. */
export function TokenDialog({ onClose, onConnected }: { onClose: () => void; onConnected: (token: string, nickname: string) => void }) {
  const [token, setToken] = useState('')
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle')
  const [error, setError] = useState('')
  const dialogRef = useFocusTrap<HTMLElement>()
  // If the shell cannot hand the URL to a browser, show it so it can be copied by hand.
  const [linkFailed, setLinkFailed] = useState(false)

  const connect = async () => {
    const value = token.trim()
    if (!value) { setState('error'); setError('アクセストークンを入力してください。'); return }
    setState('checking')
    setError('')
    try {
      const user = await new RemoClient(value).me()
      onConnected(value, user.nickname)
    } catch (cause) {
      const message = cause instanceof RemoApiError
        ? (cause.kind === 'auth' ? 'このトークンでは認証できませんでした。' : cause.message)
        : '接続を確認できませんでした。'
      setState('error')
      setError(message)
    }
  }

  return <div className="setup-backdrop" onMouseDown={onClose}>
    <section className="token-dialog" role="dialog" aria-modal="true" aria-labelledby="token-title" ref={dialogRef} onMouseDown={e => e.stopPropagation()}>
      <header>
        <div className="setup-brand"><ShieldCheck />Nature Remo に接続</div>
        <button onClick={onClose} aria-label="閉じる"><X /></button>
      </header>
      <main>
        <span className="token-mark"><KeyRound /></span>
        <h3 id="token-title">アクセストークンを入力</h3>
        <p>Nature のアカウントページで発行したトークンを貼り付けてください。入力したトークンはこの端末にのみ保存されます。</p>
        <label className="field">
          <span>アクセストークン</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            placeholder="例：xxxxxxxx-xxxx-xxxx..."
            onChange={event => { setToken(event.target.value); if (state === 'error') setState('idle') }}
            onKeyDown={event => { if (event.key === 'Enter') void connect() }}
          />
        </label>
        {state === 'error' && <div className="inline-error"><AlertTriangle />{error}</div>}
        <a className="token-link" href={TOKEN_PAGE} target="_blank" rel="noreferrer"
          onClick={event => {
            if (!isDesktop()) return
            event.preventDefault()
            void openExternal(TOKEN_PAGE).then(opened => setLinkFailed(!opened))
          }}>
          トークンを発行する<ExternalLink />
        </a>
        {linkFailed && <p className="token-fallback">ブラウザを開けませんでした。次のURLを開いてください：<code>{TOKEN_PAGE}</code></p>}
        <p className="token-note">接続後は5分あたり30回までの制限に合わせて通信を自動調整します。</p>
      </main>
      <footer>
        <button className="secondary-button" onClick={onClose}>キャンセル</button>
        <button className="primary-button" onClick={() => void connect()} disabled={state === 'checking'}>
          {state === 'checking' ? <><LoaderCircle className="spin" />確認しています…</> : <>接続する</>}
        </button>
      </footer>
    </section>
  </div>
}
