import { useState } from 'react'
import { ArrowDownToLine, Check, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import { checkForUpdate, installUpdate, restartForUpdate, type UpdateState } from './desktop/update'

/**
 * The update control in 設定 → アプリ情報.
 *
 * Nothing is downloaded until the user asks for it, and the version shown comes from
 * package.json at build time (`__APP_VERSION__`) so it cannot drift from what was released.
 */
export function UpdateCard() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const busy = state.phase === 'checking' || state.phase === 'downloading'

  return <div className="update-card">
    <div className="update-head">
      <span>現在のバージョン</span>
      <strong>{__APP_VERSION__}</strong>
    </div>

    {state.phase === 'idle' && <p>更新があるか GitHub のリリースを確認します。</p>}
    {state.phase === 'checking' && <p className="update-busy"><LoaderCircle className="spinning" />確認しています…</p>}
    {state.phase === 'current' && <p className="update-ok"><Check />最新の状態です。</p>}

    {state.phase === 'available' && <div className="update-found">
      <strong>バージョン {state.version} が公開されています</strong>
      {state.notes && <pre>{state.notes}</pre>}
    </div>}

    {state.phase === 'downloading' && <div className="update-progress">
      <p className="update-busy"><LoaderCircle className="spinning" />ダウンロードしています…</p>
      <div className="update-bar"><i style={{ width: `${state.percent ?? 12}%` }} /></div>
      {state.percent != null && <span>{state.percent}%</span>}
    </div>}

    {state.phase === 'ready' && <p className="update-ok"><Check />インストールしました。再起動すると新しいバージョンで開きます。</p>}
    {state.phase === 'error' && <p className="update-error"><TriangleAlert />{state.message}</p>}

    <div className="update-actions">
      {state.phase === 'available' && <button
        className="primary-button"
        onClick={() => { void installUpdate(setState) }}
      ><ArrowDownToLine />ダウンロードして更新</button>}

      {state.phase === 'ready' && <button
        className="primary-button"
        onClick={() => { void restartForUpdate() }}
      ><RotateCw />再起動して適用</button>}

      {state.phase !== 'available' && state.phase !== 'ready' && <button
        className="secondary-button"
        disabled={busy}
        onClick={() => { setState({ phase: 'checking' }); void checkForUpdate().then(setState) }}
      ><RotateCw />更新を確認</button>}
    </div>
  </div>
}
