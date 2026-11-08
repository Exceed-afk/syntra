// One modal behaviour for the whole app: focus moves in when it opens, Tab stays
// inside, Escape closes, and focus returns to the control that opened it.
//
// The calculator's dialogs already used the same rules (modules/Calculator/
// useModalDialog.ts); this component is the general one and takes an optional
// `trigger` ref so the return-focus target is exact when the trigger is a ref.
// `size` is layout only: sm = a question, md = a short form, lg = a form with
// sections. Nothing here touches business rules.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export const focusablesIn = (root: HTMLElement | null): HTMLElement[] =>
  root
    ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
    : []

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Rendered in a footer row, right-aligned (usually the primary button). */
  actions?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** The element that opened the dialog; focus goes back to it on close. */
  trigger?: RefObject<HTMLElement | null>
  /** Set false for a dialog that must be answered (no backdrop click, no Esc). */
  dismissable?: boolean
  describedBy?: string
}

export function Modal({ open, onClose, title, children, actions, size = 'md', trigger, dismissable = true, describedBy }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 8)}`).current
  const opener = useRef<HTMLElement | null>(null)

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
    <div className="modal-scrim" onMouseDown={(e) => { if (dismissable && e.target === e.currentTarget) onClose() }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-size={size}
        className="modal-panel card"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && dismissable) { e.stopPropagation(); e.preventDefault(); onClose(); return }
          if (e.key !== 'Tab') return
          const items = focusablesIn(panelRef.current)
          if (items.length === 0) { e.preventDefault(); return }
          const first = items[0], last = items[items.length - 1]
          const active = document.activeElement
          if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) { e.preventDefault(); last.focus() }
          else if (!e.shiftKey && (active === last || !panelRef.current?.contains(active))) { e.preventDefault(); first.focus() }
        }}
      >
        <div className="modal-head">
          <h2 id={titleId} className="section-title">{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  )
}
