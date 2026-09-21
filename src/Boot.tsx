import { useEffect, useState } from 'react'
import App from './App'
import { Mini } from './Mini'
import { loadSession, type Session } from './data/session'
import { isDesktop, isMiniWindow } from './desktop/window'

/**
 * Resolves the stored session before the app mounts. Without this the adapter would start as
 * Mock, flash the demo home, then swap to Cloud once the token resolved.
 */
export function Boot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    // Running inside the shell means the frame is the real window, not a mock-up.
    if (isDesktop()) document.documentElement.classList.add('tauri')
    let cancelled = false
    void loadSession().then(value => { if (!cancelled) setSession(value ?? null) })
    return () => { cancelled = true }
  }, [])

  if (session === undefined) {
    return <div className="boot-screen" role="status" aria-live="polite">
      <img className="boot-mark" src="/icon.png" alt="" />
      <strong>AirLit</strong>
      <small>起動しています…</small>
    </div>
  }
  if (isMiniWindow()) return <Mini initialSession={session} />
  return <App initialSession={session} />
}
