import { useCallback, useEffect, useRef, useState } from 'react'
import type { Device } from '../types'
import {
  loadLibrary, saveLibrary, shouldFire, resolveReservation,
  type Automation, type Library, type Reservation, type Scene, type SceneAction,
} from './library'

export type RunActions = (actions: SceneAction[]) => Promise<{ done: number; missing: number }>

const TICK_MS = 20_000

/** Owns the local scene/automation library and runs time-based automations. */
export type RunResult = { done: number; missing: number }

export function useLibrary(
  kind: string,
  devices: Device[],
  runActions: RunActions,
  onFired: (a: Automation, result: RunResult) => void,
  onReservation: (reservation: Reservation, outcome: 'done' | 'missed', result: RunResult) => void,
) {
  const [library, setLibrary] = useState<Library>(() => loadLibrary(kind))
  const firstLoad = useRef(true)

  // Reload when the account changes; ids from one home are meaningless in another.
  useEffect(() => {
    firstLoad.current = true
    setLibrary(loadLibrary(kind))
  }, [kind])

  useEffect(() => { saveLibrary(kind, library) }, [kind, library])

  const update = useCallback((fn: (l: Library) => Library) => setLibrary(fn), [])

  const addScene = useCallback((scene: Scene) => update(l => ({ ...l, scenes: [...l.scenes, scene] })), [update])
  const removeScene = useCallback((id: string) => update(l => ({ ...l, scenes: l.scenes.filter(s => s.id !== id) })), [update])
  const addAutomation = useCallback((automation: Automation) =>
    update(l => ({ ...l, automations: [...l.automations, automation] })), [update])
  const setAutomationEnabled = useCallback((id: string, enabled: boolean) =>
    update(l => ({ ...l, automations: l.automations.map(a => a.id === id ? { ...a, enabled } : a) })), [update])

  const addReservation = useCallback((reservation: Reservation) =>
    update(l => ({ ...l, reservations: [...l.reservations, reservation] })), [update])
  const removeReservation = useCallback((id: string) =>
    update(l => ({ ...l, reservations: l.reservations.filter(r => r.id !== id) })), [update])
  const clearFinishedReservations = useCallback(() =>
    update(l => ({ ...l, reservations: l.reservations.filter(r => r.status === 'pending') })), [update])

  const runScene = useCallback(async (scene: Scene) => runActions(scene.actions), [runActions])

  // Latest values for the ticker without restarting the interval every render.
  const state = useRef({ library, devices, runActions, onFired, onReservation })
  state.current = { library, devices, runActions, onFired, onReservation }

  useEffect(() => {
    // On mount, treat "now" as the baseline so a time that already passed today
    // does not fire the moment the app opens.
    let since = Date.now()
    firstLoad.current = false
    const tick = () => {
      const now = new Date()
      const due = state.current.library.automations.filter(a => shouldFire(a, now, since))
      const settled = state.current.library.reservations
        .map(r => ({ reservation: r, outcome: resolveReservation(r, now.getTime(), since) }))
        .filter((s): s is { reservation: Reservation; outcome: 'done' | 'missed' } =>
          s.outcome !== 'pending' && s.outcome !== s.reservation.status)
      since = now.getTime()

      for (const { reservation, outcome } of settled) {
        // A reservation is only reported as executed once the writes have been attempted —
        // an appliance deleted since it was made counts as missing, not as done.
        if (outcome === 'done') {
          void state.current.runActions(reservation.actions)
            .then(result => state.current.onReservation(reservation, 'done', result))
        } else {
          state.current.onReservation(reservation, 'missed', { done: 0, missing: reservation.actions.length })
        }
      }
      if (settled.length) setLibrary(l => ({
        ...l,
        reservations: l.reservations.map(r => {
          const hit = settled.find(s => s.reservation.id === r.id)
          return hit ? { ...r, status: hit.outcome } : r
        }),
      }))

      if (!due.length) return
      for (const automation of due) {
        void state.current.runActions(automation.actions).then(result => state.current.onFired(automation, result))
        setLibrary(l => ({
          ...l,
          automations: l.automations.map(a => a.id === automation.id ? { ...a, lastFiredAt: now.getTime() } : a),
        }))
      }
    }
    const timer = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(timer)
  }, [kind])

  return {
    ...library,
    addScene, removeScene, addAutomation, setAutomationEnabled, runScene,
    addReservation, removeReservation, clearFinishedReservations,
  }
}
