// The filter popover: a button that opens a small panel of selects, plus the
// removable chips for whatever is currently active. The chip row lives under
// the toolbar (`FilterChips`), so a filter is always visible and one click
// removable, even with the popover closed.
//
// Layout only: the caller owns the values and decides what a filter means.
import { useRef, useState, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Popover } from './Popover'

export interface FilterOption {
  /** Stable key of this filter, e.g. "priority". */
  id: string
  /** The label in the popover, e.g. "Priority". */
  label: string
  /** The current value ('' = no filter). */
  value: string
  /** What the empty option says, e.g. "All priorities". */
  allLabel: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

export interface ActiveFilterChip {
  id: string
  label: string
  onRemove: () => void
}

interface FilterPopoverProps {
  filters: FilterOption[]
  activeCount: number
  onClearAll?: () => void
  /** Extra controls that are not filters, such as a sort order. */
  children?: ReactNode
  label?: string
}

export function FilterPopover({ filters, activeCount, onClearAll, children, label = 'Filters' }: FilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return (
    <span className="toolbar-popover-anchor">
      <button
        ref={button}
        type="button"
        className={`btn btn-sm ${activeCount > 0 ? 'border-accent text-accent-fg' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        {label}
        {activeCount > 0 && <span className="count-badge" aria-label={`${activeCount} active`}>{activeCount}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={button} label="Filters" align="end" className="popover-filters">
        {filters.map((f) => (
          <label key={f.id} className="block text-xs text-muted">
            {f.label}
            <select className="field mt-1" value={f.value} aria-label={f.label} onChange={(e) => f.onChange(e.target.value)}>
              <option value="">{f.allLabel}</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
        {children}
        {onClearAll && (
          <div className="popover-actions">
            <button type="button" className="btn btn-sm" onClick={onClearAll} disabled={activeCount === 0}>Clear all</button>
          </div>
        )}
      </Popover>
    </span>
  )
}

/** The active filters as removable chips, shown right under the toolbar. */
export function FilterChips({ chips, onClearAll }: { chips: ActiveFilterChip[]; onClearAll?: () => void }) {
  if (chips.length === 0) return null
  return (
    <div className="filter-chips" role="group" aria-label="Active filters">
      {chips.map((chip) => (
        <span key={chip.id} className="filter-chip">
          {chip.label}
          <button type="button" onClick={chip.onRemove} aria-label={`Remove filter ${chip.label}`}><X size={12} aria-hidden="true" /></button>
        </span>
      ))}
      {onClearAll && chips.length > 1 && (
        <button type="button" className="filter-chips-clear" onClick={onClearAll}>Clear all</button>
      )}
    </div>
  )
}
