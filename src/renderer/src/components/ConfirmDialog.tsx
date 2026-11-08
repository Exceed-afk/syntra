// The app's confirm and prompt dialogs. They replace window.confirm() and
// window.prompt() everywhere, so every question looks the same, is keyboard
// complete (Enter = confirm, Escape = cancel) and returns focus afterwards.
//
// Usage:
//   <ConfirmDialog open={...} onClose={...} tone="danger" title="Delete the tag?"
//     text="The items stay; only the tag goes." confirmLabel="Delete" onConfirm={...} />
//   <PromptDialog open={...} onClose={...} title="Name this view" label="Name"
//     initialValue="..." onSubmit={(name) => ...} />
import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'

interface ConfirmProps {
  open: boolean
  onClose: () => void
  title: string
  text?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void
  busy?: boolean
}

export function ConfirmDialog({ open, onClose, title, text, confirmLabel, cancelLabel = 'Cancel', tone = 'default', onConfirm, busy = false }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissable={!busy}
      actions={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={busy}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) { e.preventDefault(); onConfirm() } }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {text && <p className="text-sm leading-relaxed">{text}</p>}
    </Modal>
  )
}

interface PromptProps {
  open: boolean
  onClose: () => void
  title: string
  label: string
  initialValue?: string
  placeholder?: string
  submitLabel?: string
  /** Returns an error message to keep the dialog open, or null when accepted. */
  onSubmit: (value: string) => string | null
}

export function PromptDialog({ open, onClose, title, label, initialValue = '', placeholder, submitLabel = 'Save', onSubmit }: PromptProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // Each opening starts from the initial value, not the previous attempt.
  useEffect(() => {
    if (open) { setValue(initialValue); setError('') }
  }, [open, initialValue])

  const submit = (): void => {
    const trimmed = value.trim()
    const problem = trimmed === '' ? 'Enter a name.' : onSubmit(trimmed)
    if (problem) setError(problem)
    else onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>{submitLabel}</button>
        </>
      }
    >
      <label className="block text-xs text-muted">
        {label}
        <input
          ref={input}
          className="field mt-1"
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => { setValue(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        />
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-neg">{error}</p>}
    </Modal>
  )
}
