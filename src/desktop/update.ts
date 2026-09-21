import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isDesktop } from './window'

/**
 * Checking for a new release.
 *
 * The updater reads `latest.json` published with each GitHub release and verifies its signature
 * against the public key in tauri.conf.json, so a download that was tampered with is rejected
 * before it is installed. Nothing here runs in a browser — `isDesktop()` short-circuits so the
 * dev server does not throw on a missing IPC bridge.
 */

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string; notes: string | null }
  | { phase: 'downloading'; percent: number | null }
  | { phase: 'ready' }
  | { phase: 'current' }
  | { phase: 'error'; message: string }

/** Kept between calls so 「再起動して適用」 can install what 「確認」 found. */
let pending: Update | null = null

/**
 * The updater plugin reports in English, which would be the only English text in the app.
 * The cases below are the ones a user can actually hit and do something about; anything else
 * keeps its original wording after a Japanese lead-in, so an unexpected failure stays
 * diagnosable rather than being flattened into a vague message.
 */
export function updateErrorMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
  if (!raw) return '更新を確認できませんでした。'
  const lower = raw.toLowerCase()

  if (lower.includes('release json') || lower.includes('404') || lower.includes('not found')) {
    return '公開されているリリースが見つかりませんでした。しばらくしてからもう一度お試しください。'
  }
  if (lower.includes('signature') || lower.includes('minisign')) {
    return '配布物の署名を確認できませんでした。安全のため更新を中止しました。'
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return '接続がタイムアウトしました。ネットワークの状態を確認してください。'
  }
  if (lower.includes('sending request') || lower.includes('network') || lower.includes('dns')
    || lower.includes('connect') || lower.includes('failed to fetch')) {
    return 'ネットワークに接続できませんでした。'
  }
  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('401')) {
    return 'リリースへアクセスできませんでした。'
  }
  return `更新を確認できませんでした（${raw}）。`
}

export async function checkForUpdate(): Promise<UpdateState> {
  if (!isDesktop()) return { phase: 'current' }
  try {
    const update = await check()
    if (!update) { pending = null; return { phase: 'current' } }
    pending = update
    return { phase: 'available', version: update.version, notes: update.body ?? null }
  } catch (cause) {
    pending = null
    return { phase: 'error', message: updateErrorMessage(cause) }
  }
}

/**
 * Downloads and installs the update found by `checkForUpdate`, reporting progress so the user
 * is not left watching a still screen on a slow connection.
 */
export async function installUpdate(onProgress: (state: UpdateState) => void): Promise<void> {
  const update = pending
  if (!update) { onProgress({ phase: 'error', message: '先に更新を確認してください。' }); return }
  let total: number | null = null
  let received = 0
  onProgress({ phase: 'downloading', percent: null })
  try {
    await update.downloadAndInstall(event => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? null
        onProgress({ phase: 'downloading', percent: total ? 0 : null })
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength
        onProgress({ phase: 'downloading', percent: total ? Math.min(100, Math.round((received / total) * 100)) : null })
      } else {
        onProgress({ phase: 'ready' })
      }
    })
    onProgress({ phase: 'ready' })
  } catch (cause) {
    onProgress({ phase: 'error', message: updateErrorMessage(cause) })
  }
}

/** Restarts into the installed version. */
export async function restartForUpdate() {
  if (!isDesktop()) return
  try { await relaunch() } catch { /* the user can restart by hand */ }
}
