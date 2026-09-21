import { AirVent, AlertTriangle, Play, Power, Radio, Zap } from 'lucide-react'
import type { JournalKind } from './data/journal'

/** One glyph per kind of logged operation, shared by 履歴 and the notification centre. */
export function journalIcon(kind: JournalKind) {
  switch (kind) {
    case 'aircon': return <AirVent />
    case 'scene': return <Play />
    case 'automation': return <Zap />
    case 'signal': return <Radio />
    case 'error': return <AlertTriangle />
    default: return <Power />
  }
}
