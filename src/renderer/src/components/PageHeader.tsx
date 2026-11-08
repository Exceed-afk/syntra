import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Popover } from './Popover'

// The one header every page uses: the title on the left, the primary action on
// the right. Explanatory text belongs in `help`: a small icon that opens a
// popover, so the title row stays one line at every width.
//
//   <PageHeader title="Tasks" help="…a sentence about this page…"><button className="btn-primary">New task</button></PageHeader>
//
// A status badge that belongs to the title (e.g. "In progress") can be passed
// as `badge`; it sits next to the title, never in a second line.
//
// `subtitle` is DEPRECATED and kept only while pages still pass it (commit 4
// removes the last usages and then this prop). It renders under the title.
export function PageHeader({ title, help, helpLabel, badge, subtitle, children }: {
  title: string
  help?: ReactNode
  /** The accessible name of the help button ("About Tasks"). */
  helpLabel?: string
  badge?: ReactNode
  /** @deprecated use `help` instead */
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="page-head">
      <div className="page-head-title">
        <h1 className="page-title">{title}</h1>
        {badge}
        {help && <HelpButton label={helpLabel ?? `About ${title}`}>{help}</HelpButton>}
      </div>
      {subtitle && <p className="page-sub">{subtitle}</p>}
      {children && <div className="page-actions">{children}</div>}
    </header>
  )
}

/** The help icon: a popover with the page's explanatory text. */
export function HelpButton({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return (
    <span className="help-anchor">
      <button
        ref={button}
        type="button"
        className="btn-icon help-button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        <HelpCircle size={16} aria-hidden="true" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={button} label={label} className="popover-help">
        <div className="popover-help-text">{children}</div>
      </Popover>
    </span>
  )
}

// Previous / next period arrows, always the same width so the header does not jump between periods.
// `disabled` still keeps the button in place (and readable to screen readers) instead of removing it.
export function PeriodArrows({ onPrev, onNext, prevLabel, nextLabel, nextDisabled }: {
  onPrev: () => void; onNext: () => void; prevLabel: string; nextLabel: string; nextDisabled?: boolean
}) {
  return (
    <div className="flex items-center">
      <button className="arrow" onClick={onPrev} aria-label={prevLabel} title={prevLabel}><ChevronLeft size={18} aria-hidden="true" /></button>
      <button className="arrow" onClick={onNext} aria-label={nextLabel} title={nextLabel} disabled={nextDisabled}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
  )
}
