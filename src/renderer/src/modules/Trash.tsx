// The Trash page (Phase 0): everything deleted sits here until it comes back
// or is purged. One row per DELETE BATCH. Keyboard accessible; no hardcoded
// colours.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRefreshOnCapture } from '../lib/dataChanged'
import { Trash2, Undo2 } from 'lucide-react'
import type { ModuleProps } from '../lib/navigation'
import type { TrashBatch } from '../../../shared/trash'
import { DEFAULT_TRASH_PURGE_DAYS } from '../../../shared/trash'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { Toolbar, ToolbarStart, ToolbarEnd } from '../components/Toolbar'
import { Segmented } from '../components/Segmented'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { errMsg } from '../lib/errors'
import { useSettings } from '../lib/settingsStore'
import { formatDate } from '../lib/dates'

const KIND_LABELS: Record<TrashBatch['items'][number]['type'], string> = {
  logbook: 'Journal entry',
  trade: 'Trade',
  savings_tx: 'Savings transaction',
  goal: 'Savings goal',
  habit: 'Habit',
  task: 'Task',
  note: 'Note',
  content: 'Content item',
  time_session: 'Focus session',
  project: 'Project',
  snippet: 'Snippet',
  scratchpad: 'Scratchpad',
  expense_tx: 'Expense transaction',
  recurring_bill: 'Recurring bill'
}

// Compact badge label (singular, short) for the type badge.
const TYPE_BADGE: Record<TrashBatch['items'][number]['type'], string> = {
  logbook: 'Journal',
  trade: 'Trade',
  savings_tx: 'Savings tx',
  goal: 'Goal',
  habit: 'Habit',
  task: 'Task',
  note: 'Note',
  content: 'Content',
  time_session: 'Focus',
  project: 'Project',
  snippet: 'Snippet',
  scratchpad: 'Scratchpad',
  expense_tx: 'Expense',
  recurring_bill: 'Bill'
}

const when = (batch: TrashBatch): string =>
  `${formatDate(batch.trashedAt.slice(0, 10))}${batch.count > 1 ? ` · ${batch.count} items` : ''}`

export function Trash({ onNavigate }: ModuleProps) {
  const [batches, setBatches] = useState<TrashBatch[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [pendingDelete, setPendingDelete] = useState<TrashBatch | null>(null)
  const settings = useSettings()
  const purgeDays = Math.max(0, settings.trash?.purgeDays ?? DEFAULT_TRASH_PURGE_DAYS)

  const refresh = useCallback(async () => {
    try {
      setBatches(await window.api.trash.list())
    } catch (e) {
      setError(errMsg(e))
    }
    setLoaded(true)
  }, [])

  useRefreshOnCapture(refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Types that actually exist in the trash, for the filter.
  const presentTypes = useMemo(() => {
    const set = new Set<string>()
    for (const b of batches) for (const it of b.items) set.add(it.type)
    return [...set].sort()
  }, [batches])

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return batches
    return batches.filter((b) => b.items.some((it) => it.type === typeFilter))
  }, [batches, typeFilter])

  const restore = async (batch: TrashBatch): Promise<void> => {
    setBusy(batch.batchId ?? '')
    setError('')
    try {
      await window.api.trash.restore(batch.batchId ?? '')
      await refresh()
    } catch (e) {
      setError(errMsg(e))
    }
    setBusy(null)
  }

  const forever = async (batch: TrashBatch): Promise<void> => {
    setBusy(batch.batchId ?? '')
    setError('')
    try {
      await window.api.trash.deleteForever(batch.batchId ?? '')
      await refresh()
    } catch (e) {
      setError(errMsg(e))
    }
    setBusy(null)
    setPendingDelete(null)
  }

  const filterOptions = useMemo(() => {
    const opts = [{ id: 'all', label: 'All' }]
    for (const t of presentTypes) {
      opts.push({ id: t, label: KIND_LABELS[t as TrashBatch['items'][number]['type']] })
    }
    return opts
  }, [presentTypes])

  return (
    <div className="page">
      <PageHeader title="Trash" help={`Batches trashed more than ${purgeDays} days ago are purged automatically.`} />

      {error && <p role="alert" className="text-sm text-neg">{error}</p>}

      <Toolbar label="Trash filters">
        <ToolbarStart>
          {presentTypes.length > 0 && (
            <Segmented
              label="Type filter"
              kind="group"
              value={typeFilter}
              onChange={setTypeFilter}
              options={filterOptions}
              size="sm"
            />
          )}
        </ToolbarStart>
        <ToolbarEnd>{null}</ToolbarEnd>
      </Toolbar>

      {loaded && batches.length === 0 && (
        <EmptyState icon={Trash2} title="The Trash is empty."
          text="Deleted items land here first, so a slip is never final. They go for good after the purge window (Settings) — along with the automatic daily backups, that is your safety net." />
      )}

      {loaded && batches.length > 0 && (
        <p className="mt-2 text-xs text-muted">Items are removed after {purgeDays} days.</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {filtered.map((batch) => (
          <article key={batch.batchId} className="card card-pad-sm flex items-center gap-3 min-h-14">
            <span className="badge badge-muted shrink-0">{TYPE_BADGE[batch.items[0].type]}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{batch.items.map((item) => item.label).slice(0, 3).join(' · ')}</div>
              <div className="text-xs text-muted">{when(batch)}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="btn btn-sm" onClick={() => void restore(batch)} disabled={busy != null}>
                <Undo2 size={14} /> Restore{batch.count > 1 ? ' all' : ''}
              </button>
              <button className="btn btn-sm text-neg" onClick={() => setPendingDelete(batch)} disabled={busy != null}>
                Delete forever
              </button>
            </div>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete forever?"
        text={pendingDelete ? `“${pendingDelete.items.map((i) => i.label).slice(0, 2).join(' · ')}” will be gone for good.` : undefined}
        confirmLabel="Delete forever"
        tone="danger"
        onConfirm={() => { if (pendingDelete) void forever(pendingDelete) }}
        busy={busy != null}
      />
    </div>
  )
}
