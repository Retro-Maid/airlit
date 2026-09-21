import { load } from '@tauri-apps/plugin-store'
import { isDesktop } from '../desktop/window'

/**
 * Where the Cloud API token lives.
 *
 * In the browser it falls back to localStorage, which anything running in the page can read —
 * acceptable for development, not for a shipped app. Inside Tauri it uses the store plugin
 * (`@tauri-apps/plugin-store`, an optional dependency of the shell), so the token lives in the
 * OS-protected app data directory rather than in web storage. Swapping that for
 * `tauri-plugin-stronghold` only changes this file.
 */
const KEY = 'airlit-token'
const STORE_FILE = 'credentials.json'

export type Session = { token: string; savedAt: number }

type TauriStore = {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<boolean>
  save(): Promise<void>
}

let storePromise: Promise<TauriStore | null> | null = null

async function secureStore(): Promise<TauriStore | null> {
  if (!isDesktop()) return null
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true })
      .then(store => store as unknown as TauriStore)
      .catch(error => {
        console.error('[AirLit] 保護領域を開けませんでした', error)
        return null
      })
  }
  return storePromise
}

const isSession = (value: unknown): value is Session =>
  typeof (value as Session)?.token === 'string' && !!(value as Session).token

export async function loadSession(): Promise<Session | null> {
  const store = await secureStore()
  if (store) {
    try {
      const value = await store.get<Session>(KEY)
      return isSession(value) ? value : null
    } catch { /* fall through to web storage */ }
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!isSession(parsed)) return null
    // Tokens saved before the store plugin was reachable live in web storage;
    // move them into the protected store now that it works.
    if (store) {
      try {
        await store.set(KEY, parsed)
        await store.save()
        localStorage.removeItem(KEY)
      } catch { /* keep the web-storage copy if the move fails */ }
    }
    return parsed
  } catch {
    return null
  }
}

export async function saveSession(token: string): Promise<Session> {
  const session: Session = { token: token.trim(), savedAt: Date.now() }
  const store = await secureStore()
  if (store) {
    try {
      await store.set(KEY, session)
      await store.save()
      return session
    } catch { /* fall through */ }
  }
  try { localStorage.setItem(KEY, JSON.stringify(session)) } catch { /* private mode */ }
  return session
}

export async function clearSession(): Promise<void> {
  const store = await secureStore()
  if (store) {
    try { await store.delete(KEY); await store.save() } catch { /* fall through */ }
  }
  try { localStorage.removeItem(KEY) } catch { /* private mode */ }
}

/** True when the token is only in web storage, so the UI can say so. */
export const usingSecureStorage = () => isDesktop()
