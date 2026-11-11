// The one popover style: a small panel anchored to the button that opens it.
// Escape closes it, a click outside closes it, and focus returns to the button.
// Used for the filter popover, the header help icon and any small menu.
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'

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

  // Keep the panel inside the window: shift it horizontally, flip it above the
  // trigger when it would fall off the bottom, and cap its height so it scrolls
  // rather than leaving the window. Runs before paint and again on resize or
  // scroll (the page itself scrolls inside <main>).
  useLayoutEffect(() => {
    if (!open) return
    const el = panel.current
    const button = anchor.current
    if (!el || !button) return

    const place = (): void => {
      // Measure from the untouched CSS position, not from a previous shift.
      el.style.transform = ''
      el.style.top = ''
      el.style.bottom = ''
      el.style.maxHeight = ''

      const rect = el.getBoundingClientRect()
      const a = button.getBoundingClientRect()
      const margin = 8
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let shift = 0
      if (rect.right > viewportWidth - margin) shift = viewportWidth - margin - rect.right
      if (rect.left + shift < margin) shift = margin - rect.left

      const aboveTop = a.top - 6 - rect.height
      const above = rect.bottom > viewportHeight - margin && aboveTop >= margin
      const room = above ? a.top - 6 - margin : viewportHeight - margin - (a.bottom + 6)
      if (room > 0 && rect.height > room) el.style.maxHeight = `${room}px`

      if (shift !== 0) el.style.transform = `translateX(${shift}px)`
      if (above) {
        el.style.top = 'auto'
        el.style.bottom = 'calc(100% + .375rem)'
      }
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor])

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
