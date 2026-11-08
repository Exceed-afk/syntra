// Small derived-value helpers for the preview's fake API (see ./fakeApi.ts).
//
// The app computes these in the main process, where they are plain loops over
// SQL rows plus the pure rules in src/shared. Here the same loops run over the
// fixtures, so the Focus report and the Search page show the numbers the app
// would show for the same rows. Nothing here is imported by the app.
import { splitSessionByDay } from '../../../shared/focus'
import type { FocusProjectBreakdown, FocusReport, FocusTaskBreakdown, Project, TimeSession } from '../../../shared/focus'
import { isEmptyQuery, parseQuery } from '../../../shared/search'
import type {
  LogEntry, SavingsGoal, SavingsTx, SearchResults, Task, Trade
} from '../../../shared/types'
import type { ExpenseTransaction } from '../../../modules/expenses/service/types'
import type { Note } from '../../../shared/notes'
import type { ContentItem } from '../../../shared/content'
import type { Snippet, Scratchpad } from '../../../shared/toolsData'

export interface FocusSummaryLike {
  todayFocusSeconds: number
  activeSession: null
  completedRoundsToday: number
}

/** Focus dashboard tile: today's focus seconds and completed focus rounds. */
export function focusSummary(sessions: TimeSession[], today: string): FocusSummaryLike {
  const slices = sessions
    .flatMap((s) => splitSessionByDay(s.startedAt, s.endedAt).map((slice) => ({ slice, type: s.type })))
    .filter((x) => x.slice.date === today)
  return {
    todayFocusSeconds: slices.filter((x) => x.type === 'focus' || x.type === 'count-up').reduce((sum, x) => sum + x.slice.seconds, 0),
    activeSession: null,
    completedRoundsToday: sessions.filter((s) => s.startedAt.slice(0, 10) === today && s.type === 'focus' && s.completed).length
  }
}

/** The Focus report page: totals, by-project / by-task breakdowns and the heatmap. */
export function buildFocusReport(sessions: TimeSession[], projects: Project[], from: string, to: string): FocusReport {
  const inRange = sessions.filter((s) => s.startedAt.slice(0, 10) >= from && s.startedAt.slice(0, 10) <= to)
  const slices = inRange.flatMap((s) => splitSessionByDay(s.startedAt, s.endedAt).map((slice) => ({ ...slice, session: s })))
  const focusSlices = slices.filter((x) => x.session.type === 'focus' || x.session.type === 'count-up')
  const totalFocusSeconds = focusSlices.reduce((sum, x) => sum + x.seconds, 0)
  const totalBreakSeconds = slices
    .filter((x) => x.session.type === 'short-break' || x.session.type === 'long-break')
    .reduce((sum, x) => sum + x.seconds, 0)

  const byProjectMap = new Map<number | null, { name: string; colour: string; seconds: number }>()
  for (const x of focusSlices) {
    const project = projects.find((p) => p.id === x.session.projectId) ?? null
    const key = project?.id ?? null
    const row = byProjectMap.get(key) ?? { name: project?.name ?? 'No project', colour: project?.colour ?? '#64748b', seconds: 0 }
    row.seconds += x.seconds
    byProjectMap.set(key, row)
  }
  const byProject: FocusProjectBreakdown[] = [...byProjectMap].map(([projectId, row]) => ({
    projectId, name: row.name, colour: row.colour, seconds: row.seconds,
    percentage: totalFocusSeconds > 0 ? Math.round((row.seconds / totalFocusSeconds) * 100) : 0
  })).sort((a, b) => b.seconds - a.seconds)

  const byTaskMap = new Map<number, number>()
  for (const x of focusSlices) if (x.session.taskId !== null) byTaskMap.set(x.session.taskId, (byTaskMap.get(x.session.taskId) ?? 0) + x.seconds)
  const byTask: FocusTaskBreakdown[] = [...byTaskMap].map(([taskId, seconds]) => ({ taskId, title: `Task #${taskId}`, seconds })).sort((a, b) => b.seconds - a.seconds)

  const dailyTotals: Record<string, number> = {}
  for (const x of focusSlices) dailyTotals[x.date] = (dailyTotals[x.date] ?? 0) + x.seconds
  const maxSeconds = Math.max(0, ...Object.values(dailyTotals))
  // Five bands: 0 = no activity, 4 = the busiest day of the period.
  const level = (seconds: number): 0 | 1 | 2 | 3 | 4 => {
    if (seconds <= 0 || maxSeconds <= 0) return 0
    return Math.min(4, Math.max(1, Math.ceil((seconds / maxSeconds) * 4))) as 1 | 2 | 3 | 4
  }
  const heatmap = Object.entries(dailyTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seconds]) => ({ date, seconds, level: level(seconds) }))

  return {
    from, to, totalFocusSeconds, totalBreakSeconds, sessionsCount: inRange.length,
    completedRounds: inRange.filter((s) => s.type === 'focus' && s.completed).length,
    byProject, byTask, dailyTotals, heatmap
  }
}

export interface SearchDb {
  entries: LogEntry[]
  trades: Trade[]
  goals: SavingsGoal[]
  savingsTx: SavingsTx[]
  tasks: Task[]
  notes: Note[]
  content: ContentItem[]
  snippets: Snippet[]
  scratchpads: Scratchpad[]
  expenses: ExpenseTransaction[]
  sessions: TimeSession[]
}

const group = <T,>(items: T[], total: number) => ({ items, total })

/** A simple word/tag match over the fixtures, in the Search page's grouping. */
export function buildSearchResults(text: string, limit: number, db: SearchDb): SearchResults {
  const q = parseQuery(text)
  if (isEmptyQuery(q)) {
    const empty = group([], 0)
    return {
      logbook: empty, trades: empty, goals: empty, transactions: empty, tasks: empty, notes: empty,
      content: empty, snippets: empty, expenses: empty, focus: empty, scratchpads: empty
    }
  }
  const has = (haystack: string) => q.terms.every((term) => haystack.toLowerCase().includes(term.toLowerCase()))
  const tagHas = (tags: string[]) => q.tags.every((tag) => tags.some((t) => t.startsWith(tag)))
  const matches = (haystack: string, tags: string[]) => (q.terms.length === 0 || has(haystack)) && (q.tags.length === 0 || tagHas(tags))
  const cap = <T,>(rows: T[]) => group(rows.slice(0, limit), rows.length)

  return {
    logbook: cap(db.entries.filter((e) => matches(`${e.title} ${e.body}`, e.tags))),
    trades: cap(db.trades.filter((t) => matches(`${t.asset} ${t.notes}`, t.tags))),
    goals: cap(db.goals.filter((g) => matches(`${g.name} ${g.notes}`, []))),
    transactions: cap(db.savingsTx.filter((t) => matches(t.note, [])).map((t) => ({ ...t, goalName: db.goals.find((g) => g.id === t.goalId)?.name ?? '' }))),
    tasks: cap(db.tasks.filter((t) => matches(`${t.title} ${t.notes} ${t.project ?? ''}`, t.tags))),
    notes: cap(db.notes.filter((n) => matches(`${n.title} ${n.body}`, n.tags)).map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt, tags: n.tags, preview: n.body.slice(0, 160) }))),
    content: cap(db.content.filter((c) => matches(`${c.title} ${c.hook} ${c.platform} ${c.series}`, c.tags)).map((c) => ({ id: c.id, title: c.title, stage: c.stage, platform: c.platform, targetPublishDate: c.targetPublishDate }))),
    snippets: cap(db.snippets.filter((s) => matches(`${s.title} ${s.body}`, s.tags)).map((s) => ({ id: s.id, title: s.title, tags: s.tags, preview: s.body.slice(0, 160) }))),
    expenses: cap(db.expenses.filter((e) => matches(`${e.payee} ${e.note} ${e.type}`, e.tags)).map((e) => ({ id: e.id, payee: e.payee, amount: e.amount, currency: e.currency, date: e.date, type: e.type, note: e.note }))),
    focus: cap(db.sessions.filter((s) => matches(`${s.projectName} ${s.note} ${s.type}`, [])).map((s) => ({ id: s.id, projectName: s.projectName, note: s.note, startedAt: s.startedAt, actualSeconds: s.actualSeconds, type: s.type }))),
    scratchpads: cap(db.scratchpads.filter((p) => matches(`${p.name} ${p.content}`, [])).map((p) => ({ id: p.id, name: p.name, content: p.content })))
  }
}
