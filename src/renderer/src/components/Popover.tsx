// The one popover style: a small panel anchored to the button that opens it.
// Escape closes it, a click outside closes it, and focus returns to the button.
// Used for the filter popover, the header help icon and any small menu.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

interface PopoverProps {
  open: boolean
  onClose: () => void
  /** The button the panel hangs from; it also gets focus back on close. */
  anchor: RefObject<HTMLElement | null>
  label: string
  children: ReactNode
  align?: 'start' | 'end'
  className?: string
}

export function Popover({ open, onClose, anchor, label, children, align = 'start', className = '' }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent): void => {
      const target = e.target as Node
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return
      onClose()
    }
    // Capture phase, so a page-level Escape handler cannot act first.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onClose()
      anchor.current?.focus()
    }
    document.addEventListener('mousedown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchor, onClose])

  if (!open) return null
  return (
    <div ref={panel} className={`popover ${className}`} data-align={align} role="dialog" aria-label={label}>
      {children}
    </div>
  )
}
