/**
 * Bridge to the Tauri shell.
 *
 * These are static imports on purpose. An earlier version imported them dynamically through a
 * runtime string to keep them out of the browser build — but a bare specifier cannot be
 * resolved by a webview at runtime, so every call silently failed. The packages are real
 * dependencies now; importing them in a browser is harmless because they only touch
 * `__TAURI_INTERNALS__` when a function is actually called, which `isDesktop()` guards.
 */
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { enable as enableAutostart, disable as disableAutostart, isEnabled as autostartEnabled } from '@tauri-apps/plugin-autostart'
import { openUrl } from '@tauri-apps/plugin-opener'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

const hasTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const isDesktop = () => hasTauri()

const appWindow = () => (hasTauri() ? getCurrentWindow() : null)

export const minimizeWindow = async () => {
  try {
    await appWindow()?.minimize()
    await setMiniVisible(true)
  } catch (error) { console.error('[AirLit] 最小化に失敗しました', error) }
}

/**
 * With "閉じたときにトレイへ格納" on, closing hides the window — the tray icon brings it back
 * and the app keeps polling. Off, it exits.
 */
export const closeWindow = async (hideToTray = false) => {
  const win = appWindow()
  if (!win) return
  try {
    if (hideToTray) {
      await win.hide()
      await setMiniVisible(true)
    } else {
      // close() alone leaves the tray icon and the mini window holding the process open.
      await invoke('quit_app')
    }
  } catch (error) {
    console.error('[AirLit] ウィンドウを閉じられませんでした', error)
  }
}

/** Desktop apps do not show the browser context menu on their own chrome. */
export function suppressBrowserChrome() {
  if (!hasTauri()) return () => {}
  const onContextMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, [contenteditable="true"]')) return
    event.preventDefault()
  }
  document.addEventListener('contextmenu', onContextMenu)
  return () => document.removeEventListener('contextmenu', onContextMenu)
}

// --- Start with Windows ----------------------------------------------------

export async function isAutostartEnabled(): Promise<boolean | null> {
  if (!hasTauri()) return null
  try { return await autostartEnabled() } catch { return null }
}

/** Returns the value actually in effect, so the UI can correct itself if the call fails. */
export async function setAutostart(enabled: boolean): Promise<boolean | null> {
  if (!hasTauri()) return null
  try {
    if (enabled) await enableAutostart()
    else await disableAutostart()
    return await autostartEnabled()
  } catch (error) {
    console.error('[AirLit] 自動起動の設定に失敗しました', error)
    return null
  }
}

// --- External links --------------------------------------------------------

/**
 * A webview has nowhere to open a new tab, so links must be handed to the OS browser.
 * Returns false when it could not be handled, letting the caller fall back to the anchor.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!hasTauri()) return false
  try { await openUrl(url); return true } catch { return false }
}

// --- Notifications ---------------------------------------------------------

export async function notifyNative(title: string, body?: string): Promise<boolean> {
  if (!hasTauri()) return false
  try {
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
    if (!granted) return false
    sendNotification({ title, body })
    return true
  } catch {
    return false
  }
}

// --- Mini controller -------------------------------------------------------

export const isMiniWindow = () =>
  (hasTauri() && getCurrentWindow().label === 'mini') || new URLSearchParams(location.search).has('mini')

/** Shows or hides the always-on-top mini controller. */
export async function setMiniVisible(visible: boolean) {
  if (!hasTauri()) return
  try { await invoke('show_mini', { visible }) }
  catch (error) { console.error('[AirLit] ミニコントローラーの切り替えに失敗しました', error) }
}

/** Called from the mini controller to bring the main window back. */
export async function openMainWindow() {
  if (!hasTauri()) return
  try { await invoke('open_main') }
  catch (error) { console.error('[AirLit] メインウィンドウを開けませんでした', error) }
}

/** Subscribes to the shell's mini-visibility broadcasts. Returns an unsubscribe function. */
export function onMiniVisibility(handler: (visible: boolean) => void) {
  if (!hasTauri()) return () => {}
  let stop: (() => void) | undefined
  let cancelled = false
  void listen<boolean>('mini-visible', event => handler(event.payload))
    .then(unlisten => { if (cancelled) unlisten(); else stop = unlisten })
    .catch(error => console.error('[AirLit] イベントを購読できませんでした', error))
  return () => { cancelled = true; stop?.() }
}
