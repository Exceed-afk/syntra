// A compact on/off setting: one row, a label, a one-line description and a
// switch. Used in lists of settings instead of a big clickable card per option.
//
// The switch is a real checkbox: the label wraps the whole row, so clicking
// anywhere toggles it, Space works, and screen readers hear the label and the
// description (wired with aria-describedby).
import { useId } from 'react'

interface SwitchRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Children rendered under the row only while the switch is on. */
  children?: React.ReactNode
}

export function SwitchRow({ label, description, checked, onChange, disabled = false, children }: SwitchRowProps) {
  const id = useId()
  const descId = description ? `${id}-desc` : undefined
  return (
    <div className="switch-row-block">
      <label className={`switch-row ${disabled ? 'is-disabled' : ''}`} htmlFor={id}>
        <span className="switch-row-text">
          <span className="switch-row-label">{label}</span>
          {description && <span id={descId} className="switch-row-desc">{description}</span>}
        </span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="switch-input"
          checked={checked}
          disabled={disabled}
          aria-describedby={descId}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
      </label>
      {checked && children && <div className="switch-row-extra">{children}</div>}
    </div>
  )
}
