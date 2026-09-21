/**
 * A log of what this app actually did.
 *
 * The Cloud API has no operation history, so the 履歴 screen and the notification centre used
 * to show invented entries. They are fed from here instead: every write the app performs is
 * appended, and nothing else is ever shown.
 */
export type JournalKind = 'power' | 'aircon' | 'signal' | 'scene' | 'automation' | 'error'

export type JournalEntry = {
  id: string
  at: number
  kind: JournalKind
  /** Device or scene name. */
  title: string
  detail: string
  source: string
  deviceId?: string
}

const KEY = (scope: string) => `airlit-journal:${scope}`
const MAX_ENTRIES = 200

export function readJournal(scope: string): JournalEntry[] {
  try {
    const raw = localStorage.getItem(KEY(scope))
    if (!raw) return []
    const parsed = JSON.parse(raw) as JournalEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendJournal(scope: string, entry: Omit<JournalEntry, 'id' | 'at'>): JournalEntry {
  const full: JournalEntry = {
    ...entry,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
  }
  try {
    const next = [full, ...readJournal(scope)].slice(0, MAX_ENTRIES)
    localStorage.setItem(KEY(scope), JSON.stringify(next))
  } catch { /* private mode or quota */ }
  return full
}

export function clearJournal(scope: string) {
  try { localStorage.removeItem(KEY(scope)) } catch { /* ignore */ }
}

/** Which entries deserve a place in the notification centre. */
export const isNotable = (entry: JournalEntry) => entry.kind === 'automation' || entry.kind === 'error'

export const KIND_TONES: Record<JournalKind, string> = {
  power: 'navy', aircon: 'green', signal: 'blue', scene: 'indigo', automation: 'yellow', error: 'orange',
}
