// The one date-range control: a button that opens a popover with the standard
// presets (This month, Last 30 days, This year, All time) plus custom from/to
// date inputs. The caller owns the value and decides what the range means.
//
//   <DateRangePopover value={range} onChange={setRange} />
//
// The chip comes from `dateRangeChipOf(range, setRange)`, so the active range
// shows as a removable chip under the toolbar like every other filter.
import { useRef, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { Popover } from './Popover'
import { today } from '../lib/dates'

export type DateRangePreset = 'this-month' | 'last-30' | 'this-year' | 'all' | 'custom'

export interface DateRangeValue {
  preset: DateRangePreset
  /** Only meaningful for the `custom` preset. Both ISO dates. */
  from?: string
  to?: string
}

const utc = (d: Date): string => d.toISOString().slice(0, 10)

const fromParts = (iso: string): [number, number, number] =>
  iso.split('-').map(Number) as [number, number, number]

function addDays(iso: string, n: number): string {
  const [y, m, d] = fromParts(iso)
  return utc(new Date(Date.UTC(y, m - 1, d + n)))
}

/** What the control reads as, and what the chip says. */
export function rangeLabel(range: DateRangeValue): string {
  if (range.preset === 'this-month') return 'This month'
  if (range.preset === 'last-30') return 'Last 30 days'
  if (range.preset === 'this-year') return 'This year'
  if (range.preset === 'custom') {
    if (range.from && range.to) return `${range.from} – ${range.to}`
    if (range.from) return `From ${range.from}`
    if (range.to) return `Until ${range.to}`
    return 'Custom range'
  }
  return 'All time'
}

/** Is the range anything other than "all"? */
export function isRangeActive(range: DateRangeValue): boolean {
  return range.preset !== 'all'
}

function presetDates(preset: DateRangePreset, custom: DateRangeValue): { from?: string; to?: string } {
  const now = today()
  const [y, m] = fromParts(now)
  if (preset === 'this-month') return { from: utc(new Date(Date.UTC(y, m - 1, 1))), to: undefined }
  if (preset === 'last-30') return { from: addDays(now, -29), to: undefined }
  if (preset === 'this-year') return { from: `${y}-01-01`, to: undefined }
  if (preset === 'custom') return { from: custom.from, to: custom.to }
  return {}
}

const PRESETS: { preset: Exclude<DateRangePreset, 'custom'>; label: string }[] = [
  { preset: 'this-month', label: 'This month' },
  { preset: 'last-30', label: 'Last 30 days' },
  { preset: 'this-year', label: 'This year' },
  { preset: 'all', label: 'All time' }
]

export function DateRangePopover({ value, onChange, label = 'Date range' }: {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  /** The accessible name of the button. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const active = isRangeActive(value)
  return (
    <span className="toolbar-popover-anchor">
      <button
        ref={button}
        type="button"
        className={`btn btn-sm ${active ? 'border-accent text-accent-fg' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarRange size={14} aria-hidden="true" />
        {rangeLabel(value)}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={button} label={label} align="end" className="popover-filters">
        <div className="date-presets" role="group" aria-label="Date range presets">
          {PRESETS.map((p) => (
            <button
              key={p.preset}
              type="button"
              className="btn btn-sm"
              aria-pressed={value.preset === p.preset}
              onClick={() => onChange({ preset: p.preset })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="block text-xs text-muted">From
          <input
            type="date"
            className="field mt-1"
            aria-label="From date"
            value={value.preset === 'custom' ? (value.from ?? '') : (presetDates(value.preset, value).from ?? '')}
            onChange={(e) => onChange({ preset: 'custom', from: e.target.value || undefined, to: value.to })}
          />
        </label>
        <label className="block text-xs text-muted">To
          <input
            type="date"
            className="field mt-1"
            aria-label="To date"
            value={value.preset === 'custom' ? (value.to ?? '') : (presetDates(value.preset, value).to ?? '')}
            onChange={(e) => onChange({ preset: 'custom', from: value.from, to: e.target.value || undefined })}
          />
        </label>
      </Popover>
    </span>
  )
}

/**
 * The active range as one removable chip. Pass the setter so "remove" can go
 * back to All time. Returns null when the range is already All time.
 */
export function dateRangeChipOf(range: DateRangeValue, onChange: (next: DateRangeValue) => void): { label: string; onRemove: () => void } | null {
  if (!isRangeActive(range)) return null
  return { label: rangeLabel(range), onRemove: () => onChange({ preset: 'all' }) }
}
