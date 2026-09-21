import React, { useEffect, useRef } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab inside a modal surface and restores focus to whatever opened it.
 * Without this, tabbing out of the drawer lands on the page behind it.
 */
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return
    const previous = document.activeElement as HTMLElement | null

    if (!container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? container).focus({ preventScroll: true })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault(); first.focus()
      }
    }
    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previous?.focus?.({ preventScroll: true })
    }
  }, [active])
  return ref
}

type BoundaryState = { error: Error | null }

/** One thrown render must not leave a blank window. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState { return { error } }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AirLit] 画面の描画に失敗しました', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="crash-screen" role="alert">
      <span className="state-icon error"><AlertTriangle /></span>
      <h1>問題が発生しました</h1>
      <p>画面を表示できませんでした。再読み込みすると復帰できることがあります。</p>
      <pre>{this.state.error.message}</pre>
      <button className="primary-button" onClick={() => this.setState({ error: null })}>
        <RotateCw />再試行
      </button>
    </div>
  }
}
