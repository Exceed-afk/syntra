// The ONE segmented-control style. Everything that used to be a hand-rolled
// `<div className="seg">` or a local Segmented helper uses this, so view
// switches, time ranges and layout switches always look and behave the same.
//
//   <Segmented label="Task views" kind="tabs" value={view} onChange={setView}
//     options={[{ id: 'today', label: 'Today', count: 12 }, ...]} />
//
// `kind="tabs"` is for switching between views (role=tablist); `kind="group"`
// is for a pressed/unpressed setting (role=group + aria-pressed). Arrow keys
// move between options and select them, Home/End jump to the ends.
import { useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
  /** A small trailing number (counts). */
  count?: number | null
  icon?: LucideIcon
  disabled?: boolean
  title?: string
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  kind?: 'tabs' | 'group'
  size?: 'default' | 'sm'
  className?: string
}

export function Segmented<T extends string>({ label, value, options, onChange, kind = 'tabs', size = 'default', className = '' }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (from: number, delta: number): void => {
    const usable = options.map((o, i) => ({ o, i })).filter((x) => !x.o.disabled)
    if (usable.length === 0) return
    const at = usable.findIndex((x) => x.i === from)
    const next = usable[(at + delta + usable.length) % usable.length]
    refs.current[next.i]?.focus()
    onChange(next.o.id)
  }
  return (
    <div
      className={`seg ${size === 'sm' ? 'seg-sm' : ''} ${className}`}
      role={kind === 'tabs' ? 'tablist' : 'group'}
      aria-label={label}
      onKeyDown={(e) => {
        const index = options.findIndex((o) => o.id === value)
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(index, 1) }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(index, -1) }
        else if (e.key === 'Home') { e.preventDefault(); const first = options.findIndex((o) => !o.disabled); if (first >= 0) { refs.current[first]?.focus(); onChange(options[first].id) } }
        else if (e.key === 'End') { e.preventDefault(); const last = options.map((o) => !o.disabled).lastIndexOf(true); if (last >= 0) { refs.current[last]?.focus(); onChange(options[last].id) } }
      }}
    >
      {options.map((option, i) => {
        const selected = option.id === value
        const Icon = option.icon
        const props = kind === 'tabs'
          ? { role: 'tab' as const, 'aria-selected': selected, tabIndex: selected ? 0 : -1 }
          : { 'aria-pressed': selected, tabIndex: selected ? 0 : -1 }
        return (
          <button
            key={option.id}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.id)}
            {...props}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}
            {option.label}
            {option.count != null && <span className="seg-count">{option.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
