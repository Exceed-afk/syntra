// The side detail panel: a right-hand panel that slides in over the page.
// Escape closes it, focus moves into it when it opens and returns to whatever
// opened it when it closes, and Tab stays inside it (same rules as Modal.tsx).
//
// Layout only: the caller owns the content and the data.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { focusablesIn } from './Modal'

interface SidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Width on wide windows; the panel is always flush right and full height. */
  width?: 'narrow' | 'wide'
  footer?: ReactNode
  trigger?: RefObject<HTMLElement | null>
  /** An id of the element that explains the panel, when there is one. */
  describedBy?: string
}

export function SidePanel({ open, onClose, title, children, width = 'narrow', footer, trigger, describedBy }: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = `side-panel-title-${title.replace(/\W+/g, '-').toLowerCase().slice(0, 24)}`

  useEffect(() => {
    if (!open) return
    opener.current = (trigger?.current as HTMLElement | null) ?? (document.activeElement as HTMLElement | null)
    const panel = panelRef.current
    const first = focusablesIn(panel)[0]
    if (first) first.focus()
    else panel?.focus()
    return () => {
      const back = (trigger?.current as HTMLElement | null) ?? opener.current
      if (back && back.isConnected) back.focus()
    }
  }, [open, trigger])

  if (!open) return null
  return createPortal(
    <div className="panel-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-width={width}
        className="side-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); return }
          if (e.key !== 'Tab') return
          const items = focusablesIn(panelRef.current)
          if (items.length === 0) { e.preventDefault(); return }
          const first = items[0], last = items[items.length - 1]
          const active = document.activeElement
          if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) { e.preventDefault(); last.focus() }
          else if (!e.shiftKey && (active === last || !panelRef.current?.contains(active))) { e.preventDefault(); first.focus() }
        }}
      >
        <div className="side-panel-head">
          <h2 id={titleId} className="section-title min-w-0 truncate">{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
        </div>
        <div className="side-panel-body">{children}</div>
        {footer && <div className="side-panel-foot">{footer}</div>}
      </aside>
    </div>,
    document.body
  )
}
