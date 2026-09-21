import { Home, Lightbulb, Moon, PanelTop, type LucideIcon } from 'lucide-react'
import type { SceneIcon } from './data/library'

export const sceneIcons: Record<SceneIcon, LucideIcon> = {
  home: Home,
  moon: Moon,
  away: PanelTop,
  light: Lightbulb,
}

/** The wizard offers icon choices by their Japanese label. */
export const sceneIconFor = (label: string): SceneIcon =>
  label === '就寝' ? 'moon' : label === '照明' ? 'light' : label === '外出' ? 'away' : 'home'
