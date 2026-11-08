// The toolbar row: ONE row under the page header that holds the view switches
// on the left and the actions / filters / search on the right. It wraps on a
// narrow window instead of pushing something off screen.
import type { ReactNode } from 'react'

export function Toolbar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="page-toolbar" role="toolbar" aria-label={label}>
      {children}
    </div>
  )
}

/** The left half: view tabs, mode switches. */
export function ToolbarStart({ children }: { children: ReactNode }) {
  return <div className="page-toolbar-start">{children}</div>
}

/** The right half: search, filters, layout, menus. */
export function ToolbarEnd({ children }: { children: ReactNode }) {
  return <div className="page-toolbar-end">{children}</div>
}

/**
 * The search field that joins the toolbar row. `min` is the smallest width it
 * may take before the row decides to wrap it onto its own line.
 */
export function ToolbarSearch({ value, onChange, placeholder, label, inputRef, onClear }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  inputRef?: React.MutableRefObject<HTMLInputElement | null>
  onClear?: () => void
}) {
  return (
    <span className="toolbar-search">
      <input
        ref={inputRef as React.Ref<HTMLInputElement> | undefined}
        type="search"
        className="field"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onClear ? onClear() : onChange('') } }}
      />
    </span>
  )
}
