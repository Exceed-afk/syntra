// THE FAKE `window.api` for the preview harness (npm run preview / npm run shots).
//
// It answers every call the pages make from the deterministic sample data in
// ./fixtures.ts, so every page can render in a plain browser without Electron
// and without touching the real SQLite database. Reads are answered from the
// fixtures; writes update an in-memory copy of them for the current page load
// and are gone on reload. Nothing here is ever imported by the app itself:
// main.tsx loads App, the preview loads this.
//
// Where the app has a PURE shared rule for a derived value (review, calendar,
// briefing, dashboard, focus report, search query parsing) the fake calls that
// rule, so the numbers on screen are the ones the app would show for the same
// rows. Where the rule lives in the main process's SQL, a small readable
// approximation is used instead (marked "approx": stats counts, insights).
import { DEFAULT_SETTINGS, type EverythingApi, type ImportPreview, type Settings } from '../../../shared/types'
import { computeStats, pnlSeries } from '../../../shared/trades'
import { taskDashboard, taskWeekStart, addTaskDays } from '../../../shared/tasks'
import { logStreak } from '../../../shared/dashboard'
import { habitsToday } from '../../../shared/dashboard'
import { buildBriefing } from '../../../shared/briefing'
import { buildReview } from '../../../shared/review'
import { buildCalendar, gridRange } from '../../../shared/calendar'
import { buildInsights } from '../../../shared/insights'
import { buildFocusReport, focusSummary } from './previewRules'
import { splitSessionByDay } from '../../../shared/focus'
import { DEFAULT_AUTOMATIONS, type AutomationSettings } from '../../../shared/automations'
import { DEFAULT_ASSISTANT } from '../../../shared/assistant'
import { buildSearchResults } from './previewRules'
import { DEFAULT_TRASH_PURGE_DAYS } from '../../../shared/trash'
import { DEFAULT_CALC_SETTINGS, type CalcHistoryItem, type CalcProgram, type CalcRate, type CalcRateOverride, type CalcRateSet } from '../../../shared/calculator/types'
import type { DueBill } from '../../../modules/expenses/service/recurring'
import type { DeleteBatch, AutomationActivity, DailyBriefing, ExportResult } from '../../../shared/types'
import {
  TODAY, automationActivity, content, entries, expenseBudgets, expenseCategories, expenseTx, focusSessions, goals,
  habitList, notes, projects, recurringBills, savingsTx, scratchpads, snippets, tasks,
  templates, trades, trashBatches, trashTasks
} from './fixtures'

const tick = <T,>(value: T): Promise<T> => Promise.resolve(value)
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// ---------- the in-memory copy (reset on every page load) ----------

const db = {
  entries: clone(entries),
  trades: clone(trades),
  goals: clone(goals),
  savingsTx: clone(savingsTx),
  tasks: clone(tasks),
  trashTasks: clone(trashTasks),
  habits: habitList(TODAY),
  notes: clone(notes),
  content: clone(content),
  categories: clone(expenseCategories),
  expenses: clone(expenseTx),
  budgets: clone(expenseBudgets),
  bills: clone(recurringBills),
  sessions: clone(focusSessions),
  projects: clone(projects),
  snippets: clone(snippets),
  scratchpads: clone(scratchpads),
  templates: clone(templates),
  trash: clone(trashBatches),
  activity: clone(automationActivity),
  dismissals: [] as { id: string; until: string | null }[],
  settings: {
    ...DEFAULT_SETTINGS,
    theme: 'light',
    intelligence: { features: { dailyBriefing: true, automations: true, smartQuickAdd: true, insights: true, aiAssistant: true } },
    trash: { purgeDays: DEFAULT_TRASH_PURGE_DAYS },
    taskSavedViews: [{ id: 'v1', name: 'High priority', filter: { priority: 'high' as const } }],
    pinnedTools: ['habits', 'tasks'],
    recentTools: ['trades', 'logbook', 'focus']
  } as Settings,
  automations: { ...DEFAULT_AUTOMATIONS, lossReflection: true, goalCelebration: true } as AutomationSettings,
  assistant: { ...DEFAULT_ASSISTANT, provider: 'local' } as typeof DEFAULT_ASSISTANT,
  calculatorSettings: { ...DEFAULT_CALC_SETTINGS },
  calcHistory: ([
    { id: 'h1', mode: 'standard' as const, input: '12 * 12 + 6', result: '150', resultFormat: 'decimal', pinned: true, createdAt: `${TODAY}T09:02:00.000Z` },
    { id: 'h2', mode: 'standard' as const, input: 'sqrt(2)', result: '1.4142135624', resultFormat: 'decimal', pinned: false, createdAt: `${TODAY}T09:03:00.000Z` },
    { id: 'h3', mode: 'standard' as const, input: '100 USD to EUR', result: '92.31 EUR', resultFormat: 'decimal', pinned: false, createdAt: `${TODAY}T09:05:00.000Z` },
    { id: 'h4', mode: 'standard' as const, input: 'nCr(5, 2)', result: '10', resultFormat: 'decimal', pinned: false, createdAt: `${TODAY}T09:06:00.000Z` }
  ] as CalcHistoryItem[]),
  rateSets: [{ id: 'rs1', name: 'My rates', baseCurrency: 'USD', isActive: true, updatedAt: `${TODAY}T08:00:00.000Z` }] as CalcRateSet[],
  rates: [
    { id: 'r1', rateSetId: 'rs1', currencyCode: 'EUR', rateToBase: '0.92', note: '', updatedAt: `${TODAY}T08:00:00.000Z` },
    { id: 'r2', rateSetId: 'rs1', currencyCode: 'GBP', rateToBase: '0.79', note: '', updatedAt: `${TODAY}T08:00:00.000Z` },
    { id: 'r3', rateSetId: 'rs1', currencyCode: 'JPY', rateToBase: '151.2', note: '', updatedAt: `${TODAY}T08:00:00.000Z` }
  ] as CalcRate[],
  overrides: [] as CalcRateOverride[],
  programs: [] as CalcProgram[]
}

let nextId = 5000
const id = (): number => ++nextId
const batch: DeleteBatch = 'preview-batch'

// Keep a goal's balance in step with its transactions after an in-memory write.
const recalcGoals = (): void => {
  for (const g of db.goals) {
    const mine = db.savingsTx.filter((t) => t.goalId === g.id)
    g.balance = mine.reduce((sum, t) => sum + (t.kind === 'deposit' ? t.amount : -t.amount), 0)
    g.txCount = mine.length
  }
}

const activeTasks = () => db.tasks.filter((t) => t.deletedAt === null)

// ---------- the API ----------

const api: EverythingApi = {
  settings: {
    getAll: () => tick(clone(db.settings)),
    set: (key, value) => { (db.settings as unknown as Record<string, unknown>)[key as string] = clone(value); return tick(undefined) }
  },

  logbook: {
    list: (filter) => {
      let rows = db.entries.filter((e) => e.date <= TODAY)
      if (filter?.text) {
        const q = filter.text.toLowerCase()
        rows = rows.filter((e) => e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q))
      }
      if (filter?.tag) rows = rows.filter((e) => e.tags.includes(filter.tag!))
      if (filter?.from) rows = rows.filter((e) => e.date >= filter.from!)
      if (filter?.to) rows = rows.filter((e) => e.date <= filter.to!)
      return tick(clone(rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)))
    },
    tags: () => {
      const counts = new Map<string, number>()
      for (const e of db.entries) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
      return tick([...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count))
    },
    create: (input) => {
      const entry = { ...input, id: id(), createdAt: `${TODAY}T12:00:00.000Z`, updatedAt: `${TODAY}T12:00:00.000Z` }
      db.entries.unshift(entry)
      return tick(clone(entry))
    },
    update: (idNum, input) => {
      const i = db.entries.findIndex((e) => e.id === idNum)
      const entry = { ...(i >= 0 ? db.entries[i] : { id: idNum, createdAt: `${TODAY}T12:00:00.000Z` }), ...input, updatedAt: `${TODAY}T12:00:00.000Z` }
      if (i >= 0) db.entries[i] = entry
      return tick(clone(entry))
    },
    remove: (idNum) => { db.entries = db.entries.filter((e) => e.id !== idNum); return tick(batch) }
  },

  trades: {
    list: (filter) => {
      let rows = [...db.trades]
      if (filter?.text) {
        const q = filter.text.toLowerCase()
        rows = rows.filter((t) => t.asset.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q))
      }
      if (filter?.direction) rows = rows.filter((t) => t.direction === filter.direction)
      if (filter?.tag) rows = rows.filter((t) => t.tags.includes(filter.tag!))
      if (filter?.from) rows = rows.filter((t) => t.date >= filter.from!)
      if (filter?.to) rows = rows.filter((t) => t.date <= filter.to!)
      return tick(clone(rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)))
    },
    meta: () => tick({
      assets: [...new Set(db.trades.map((t) => t.asset))].sort(),
      tags: (() => {
        const counts = new Map<string, number>()
        for (const t of db.trades) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
        return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
      })()
    }),
    create: (input) => {
      const move = input.exitPrice === null ? null : Math.round(((input.direction === 'long' ? input.exitPrice - input.entryPrice : input.entryPrice - input.exitPrice) * input.quantity - input.fees) * 100) / 100
      const row = { ...input, id: id(), pnl: move, closedAt: input.exitPrice === null ? null : `${input.date}T21:00:00.000Z`, createdAt: `${TODAY}T12:00:00.000Z`, updatedAt: `${TODAY}T12:00:00.000Z` }
      db.trades.unshift(row)
      return tick(clone(row))
    },
    update: (idNum, input) => {
      const move = input.exitPrice === null ? null : Math.round(((input.direction === 'long' ? input.exitPrice - input.entryPrice : input.entryPrice - input.exitPrice) * input.quantity - input.fees) * 100) / 100
      const i = db.trades.findIndex((t) => t.id === idNum)
      const row = { ...(i >= 0 ? db.trades[i] : { id: idNum, closedAt: null, createdAt: '', updatedAt: '' }), ...input, pnl: move, updatedAt: `${TODAY}T12:00:00.000Z` }
      if (i >= 0) db.trades[i] = row
      return tick(clone(row))
    },
    remove: (idNum) => { db.trades = db.trades.filter((t) => t.id !== idNum); return tick(batch) }
  },

  savings: {
    listGoals: () => tick(clone(db.goals)),
    createGoal: (input) => {
      const goal = { ...input, id: id(), balance: 0, txCount: 0, createdAt: `${TODAY}T12:00:00.000Z`, updatedAt: `${TODAY}T12:00:00.000Z` }
      db.goals.push(goal)
      return tick(clone(goal))
    },
    updateGoal: (idNum, input) => {
      const i = db.goals.findIndex((g) => g.id === idNum)
      const goal = { ...(i >= 0 ? db.goals[i] : { id: idNum, balance: 0, txCount: 0, createdAt: '', updatedAt: '' }), ...input }
      if (i >= 0) db.goals[i] = goal
      return tick(clone(goal))
    },
    removeGoal: (idNum) => {
      db.goals = db.goals.filter((g) => g.id !== idNum)
      db.savingsTx = db.savingsTx.filter((t) => t.goalId !== idNum)
      return tick(batch)
    },
    listTransactions: (goalId) => tick(clone(db.savingsTx.filter((t) => t.goalId === goalId).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id))),
    addTransaction: (input) => {
      const row = { ...input, id: id(), createdAt: `${TODAY}T12:00:00.000Z`, updatedAt: `${TODAY}T12:00:00.000Z` }
      db.savingsTx.unshift(row)
      recalcGoals()
      return tick(clone(row))
    },
    updateTransaction: (idNum, input) => {
      const i = db.savingsTx.findIndex((t) => t.id === idNum)
      const row = { ...(i >= 0 ? db.savingsTx[i] : { id: idNum, createdAt: '', updatedAt: '' }), ...input, updatedAt: `${TODAY}T12:00:00.000Z` }
      if (i >= 0) db.savingsTx[i] = row
      recalcGoals()
      return tick(clone(row))
    },
    removeTransaction: (idNum) => { db.savingsTx = db.savingsTx.filter((t) => t.id !== idNum); recalcGoals(); return tick(batch) }
  },

  tasks: {
    list: () => tick(clone(activeTasks().sort((a, b) => a.position - b.position))),
    completed: (date) => tick(clone(activeTasks().filter((t) => t.status === 'done' && (t.completedAt ?? '').slice(0, 10) === date))),
    trash: () => tick(clone(db.trashTasks)),
    create: (input) => {
      const task = {
        ...input, id: id(), createdAt: `${TODAY}T12:00:00.000Z`, completedAt: null, deletedAt: null, position: db.tasks.length + 1,
        subtasks: input.subtasks.map((s, i) => ({ id: id() * 10 + i, taskId: 0, title: s.title, done: s.done, sortOrder: i }))
      }
      task.subtasks = task.subtasks.map((s) => ({ ...s, taskId: task.id }))
      db.tasks.push(task)
      return tick(clone(task))
    },
    update: (idNum, input) => {
      const i = db.tasks.findIndex((t) => t.id === idNum)
      const before = i >= 0 ? db.tasks[i] : null
      const task = {
        ...(before ?? { id: idNum, createdAt: '', completedAt: null, deletedAt: null, position: db.tasks.length + 1 }),
        ...input,
        subtasks: input.subtasks.map((s, idx) => ({ id: (before?.subtasks[idx]?.id ?? idNum * 10 + idx), taskId: idNum, title: s.title, done: s.done, sortOrder: idx }))
      }
      if (i >= 0) db.tasks[i] = task
      return tick(clone(task))
    },
    remove: (idNum) => {
      const task = db.tasks.find((t) => t.id === idNum)
      if (task) db.trashTasks.unshift({ ...task, deletedAt: `${TODAY}T12:00:00.000Z` })
      db.tasks = db.tasks.filter((t) => t.id !== idNum)
      return tick(batch)
    },
    restore: (idNum) => {
      const task = db.trashTasks.find((t) => t.id === idNum)
      if (task) { db.tasks.push({ ...task, deletedAt: null }); db.trashTasks = db.trashTasks.filter((t) => t.id !== idNum) }
      return tick(undefined)
    },
    deleteForever: (idNum) => { db.trashTasks = db.trashTasks.filter((t) => t.id !== idNum); return tick(undefined) },
    clearTrash: () => { db.trashTasks = []; return tick(undefined) },
    rescheduleMany: (ids, dueDate, dueTime) => {
      for (const t of db.tasks) if (ids.includes(t.id)) { t.dueDate = dueDate; t.dueTime = dueTime ?? null }
      return tick(undefined)
    },
    setStatus: (idNum, status) => {
      const task = db.tasks.find((t) => t.id === idNum)
      if (!task) return Promise.reject(new Error('No such task'))
      task.status = status
      task.completedAt = status === 'done' ? `${TODAY}T12:00:00.000Z` : null
      return tick(clone(task))
    },
    undoStatus: (idNum, status, completedAt) => {
      const task = db.tasks.find((t) => t.id === idNum)
      if (task) { task.status = status; task.completedAt = completedAt }
      return tick(undefined)
    },
    setStatusMany: (ids, status) => {
      for (const t of db.tasks) if (ids.includes(t.id)) { t.status = status; t.completedAt = status === 'done' ? `${TODAY}T12:00:00.000Z` : null }
      return tick(undefined)
    },
    removeMany: (ids) => {
      for (const idNum of ids) {
        const task = db.tasks.find((t) => t.id === idNum)
        if (task) db.trashTasks.unshift({ ...task, deletedAt: `${TODAY}T12:00:00.000Z` })
      }
      db.tasks = db.tasks.filter((t) => !ids.includes(t.id))
      return tick(batch)
    },
    reorder: (ids) => {
      ids.forEach((idNum, i) => { const t = db.tasks.find((x) => x.id === idNum); if (t) t.position = i + 1 })
      return tick(undefined)
    },
    setSubtaskDone: (taskId, subtaskId, done) => {
      const sub = db.tasks.find((t) => t.id === taskId)?.subtasks.find((s) => s.id === subtaskId)
      if (sub) sub.done = done
      return tick(undefined)
    },
    reorderSubtasks: (taskId, ids) => {
      const task = db.tasks.find((t) => t.id === taskId)
      if (task) task.subtasks = ids.map((sid, i) => ({ ...task.subtasks.find((s) => s.id === sid)!, sortOrder: i }))
      return tick(undefined)
    },
    promoteSubtask: (taskId, subtaskId) => {
      const task = db.tasks.find((t) => t.id === taskId)!
      const sub = task.subtasks.find((s) => s.id === subtaskId)
      if (sub) {
        task.subtasks = task.subtasks.filter((s) => s.id !== subtaskId)
        const promoted = { ...task, id: id(), title: sub.title, notes: '', status: 'todo' as const, completedAt: null, subtasks: [], position: db.tasks.length + 1, recurrenceRule: null, recurrenceNext: null }
        db.tasks.push(promoted)
        return tick(clone(task))
      }
      return tick(clone(task))
    },
    skipOccurrence: (idNum) => {
      const task = db.tasks.find((t) => t.id === idNum)!
      task.status = 'done'
      task.completedAt = `${TODAY}T12:00:00.000Z`
      return tick(clone(task))
    }
  },

  habits: {
    list: () => tick({ today: TODAY, habits: clone(db.habits) }),
    create: (input) => {
      const habit = { ...input, id: id(), notes: input.notes ?? '', archived: input.archived ?? false, startDate: TODAY, checkins: [], completions: [], stats: { current: 0, best: 0, rate30: null, total: 0 }, createdAt: TODAY, updatedAt: TODAY }
      db.habits.push(habit)
      return tick(clone(habit))
    },
    update: (idNum, input) => {
      const habit = db.habits.find((h) => h.id === idNum)!
      Object.assign(habit, input)
      return tick(clone(habit))
    },
    remove: (idNum) => { db.habits = db.habits.filter((h) => h.id !== idNum); return tick(batch) },
    setCheckin: (habitId, date, done) => {
      const habit = db.habits.find((h) => h.id === habitId)
      if (habit) {
        habit.checkins = done ? [...new Set([...habit.checkins, date])].sort() : habit.checkins.filter((d) => d !== date)
        habit.completions = (habit.completions ?? []).filter((c) => c.date !== date)
        if (done) habit.completions.push({ date, status: 'done' })
      }
      return tick(undefined)
    },
    setDayStatus: (habitId, date, status, value) => {
      const habit = db.habits.find((h) => h.id === habitId)
      if (habit) {
        habit.completions = (habit.completions ?? []).filter((c) => c.date !== date)
        habit.checkins = habit.checkins.filter((d) => d !== date)
        if (status === 'done') { habit.completions.push({ date, status, ...(value == null ? {} : { value }) }); habit.checkins.push(date) }
        if (status === 'skipped') habit.completions.push({ date, status })
      }
      return tick(undefined)
    },
    logValue: (habitId, date, value) => {
      const habit = db.habits.find((h) => h.id === habitId)
      if (habit) {
        habit.completions = (habit.completions ?? []).filter((c) => c.date !== date)
        habit.completions.push({ date, status: 'done', value })
        if (!habit.checkins.includes(date)) habit.checkins.push(date)
      }
      return tick(undefined)
    },
    reorder: (ids) => {
      ids.forEach((idNum, i) => { const h = db.habits.find((x) => x.id === idNum); if (h) h.sortOrder = i })
      db.habits.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      return tick(undefined)
    }
  },

  // Expenses: a readable approximation of the service's SQL (the real rules are
  // in src/modules/expenses/service and are NOT duplicated here).
  expenses: {
    overview: (month, today) => {
      const inMonth = db.expenses.filter((t) => t.date.slice(0, 7) === month && t.deletedAt === null)
      const cx = inMonth.filter((t) => t.type === 'expense')
      const budgets = db.budgets.filter((b) => b.month === month)
      const [y, m, d] = today.split('-').map(Number)
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
      const spentSoFar = cx.filter((t) => t.date <= today).reduce((s, t) => s + t.amount, 0)
      const due = db.bills.filter((b) => !b.archived && b.nextDueDate.slice(0, 7) === month && b.nextDueDate >= today)
      const billsStillDue = due.reduce((s, b) => s + b.amount, 0)
      const leftToSpend = totalBudget - spentSoFar - billsStillDue
      const daysRemaining = Math.max(0, daysInMonth - d + 1)
      return tick({
        month, asOfDate: today, currency: 'USD', totalBudget, spentSoFar, billsStillDue, leftToSpend, daysRemaining,
        safeToSpendPerDay: leftToSpend > 0 && daysRemaining > 0 ? Math.floor(leftToSpend / daysRemaining) : 0,
        categories: db.categories.filter((c) => !c.archived).map((c) => {
          const budgetAmount = budgets.find((b) => b.categoryId === c.id)?.amount ?? 0
          const spentAmount = cx.filter((t) => t.categoryId === c.id).reduce((s, t) => s + t.amount, 0)
          return { categoryId: c.id, categoryName: c.name, budgetAmount, spentAmount, billsDueAmount: 0, leftToSpend: budgetAmount - spentAmount }
        })
      })
    },
    dueBills: (_month, asOf) => tick(db.bills
      .filter((b) => !b.archived && b.nextDueDate >= `${asOf.slice(0, 8)}01` && b.nextDueDate.slice(0, 7) === asOf.slice(0, 7))
      .map((b) => ({ bill: clone(b), dueDate: b.nextDueDate, amount: b.amount })) as DueBill[]),
    listCategories: (includeArchived) => tick(clone(db.categories.filter((c) => includeArchived || !c.archived))),
    listTransactions: (filter) => tick(clone(db.expenses.filter((t) => {
      if (filter?.month && t.date.slice(0, 7) !== filter.month) return false
      if (filter?.startDate && t.date < filter.startDate) return false
      if (filter?.endDate && t.date > filter.endDate) return false
      if (filter?.categoryId && t.categoryId !== filter.categoryId) return false
      if (filter?.type && t.type !== filter.type) return false
      return true
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id))),
    createTransaction: (input) => {
      const row = { ...input, id: id(), currency: input.currency ?? 'USD', categoryId: input.categoryId ?? null, payee: input.payee ?? '', note: input.note ?? '', tags: input.tags ?? [], transferTarget: input.transferTarget ?? null, recurringId: input.recurringId ?? null, createdAt: TODAY, updatedAt: TODAY, deletedAt: null, deleteBatchId: null }
      db.expenses.unshift(row)
      return tick(clone(row))
    },
    updateTransaction: (idNum, input) => {
      const i = db.expenses.findIndex((t) => t.id === idNum)
      const row = { ...db.expenses[i], ...input, updatedAt: TODAY }
      db.expenses[i] = row
      return tick(clone(row))
    },
    deleteTransaction: (idNum) => { db.expenses = db.expenses.filter((t) => t.id !== idNum); return tick(batch) },
    listBudgets: (month) => tick(clone(db.budgets.filter((b) => b.month === month))),
    setBudget: (input) => {
      const found = db.budgets.find((b) => b.categoryId === input.categoryId && b.month === input.month)
      if (found) { found.amount = input.amount; return tick(clone(found)) }
      const row = { id: id(), categoryId: input.categoryId, month: input.month, amount: input.amount, currency: input.currency ?? 'USD', createdAt: TODAY, updatedAt: TODAY, deletedAt: null, deleteBatchId: null }
      db.budgets.push(row)
      return tick(clone(row))
    },
    deleteBudget: (idNum) => { db.budgets = db.budgets.filter((b) => b.id !== idNum); return tick(batch) },
    copyBudgets: (targetMonth) => {
      const source = db.budgets.filter((b) => b.month === TODAY.slice(0, 7))
      for (const b of source) db.budgets.push({ ...b, id: id(), month: targetMonth })
      return tick(clone(db.budgets.filter((b) => b.month === targetMonth)))
    },
    listRecurringBills: (includeArchived) => tick(clone(db.bills.filter((b) => includeArchived || !b.archived))),
    createRecurringBill: (input) => {
      const row = { ...input, id: id(), currency: input.currency ?? 'USD', intervalDays: input.intervalDays ?? null, categoryId: input.categoryId ?? null, reminderLeadDays: input.reminderLeadDays ?? 3, autopay: input.autopay ?? false, trialEndDate: input.trialEndDate ?? null, payee: input.payee ?? '', note: input.note ?? '', archived: false, createdAt: TODAY, updatedAt: TODAY, deletedAt: null, deleteBatchId: null }
      db.bills.push(row)
      return tick(clone(row))
    },
    updateRecurringBill: (idNum, input) => {
      const i = db.bills.findIndex((b) => b.id === idNum)
      db.bills[i] = { ...db.bills[i], ...input, updatedAt: TODAY }
      return tick(clone(db.bills[i]))
    },
    deleteRecurringBill: (idNum) => { db.bills = db.bills.filter((b) => b.id !== idNum); return tick(batch) },
    markBillPaid: ({ recurringId, dueDate, amount }) => {
      const bill = db.bills.find((b) => b.id === recurringId)!
      const transaction = { id: id(), amount: amount ?? bill.amount, currency: bill.currency, date: dueDate, categoryId: bill.categoryId, payee: bill.payee, note: '', type: 'expense' as const, tags: [], transferTarget: null, recurringId, createdAt: TODAY, updatedAt: TODAY, deletedAt: null, deleteBatchId: null }
      db.expenses.unshift(transaction)
      const occurrence = { id: id(), recurringId, dueDate, status: 'paid' as const, transactionId: transaction.id, paidAt: TODAY, createdAt: TODAY, updatedAt: TODAY, deletedAt: null, deleteBatchId: null }
      return tick({ occurrence, transaction: clone(transaction) })
    },
    transferLeftover: ({ amountCents, goalId, date, note }) => {
      const goal = db.goals.find((g) => g.id === goalId)!
      const transaction = { id: id(), amount: amountCents, currency: 'USD', date, categoryId: null, payee: `Savings goal: ${goal.name}`, note: note ?? '', type: 'transfer' as const, tags: [], transferTarget: `goal:${goalId}`, recurringId: null, createdAt: TODAY, updatedAt: TODAY, deletedAt: null, deleteBatchId: null }
      db.expenses.unshift(transaction)
      const savingsTxId = id()
      db.savingsTx.unshift({ id: savingsTxId, goalId, date, kind: 'deposit', amount: amountCents / 100, note: note ?? '', createdAt: TODAY, updatedAt: TODAY })
      recalcGoals()
      return tick({ expenseTransaction: clone(transaction), savingsTransactionId: savingsTxId, goalId, goalName: goal.name, amountCents, currency: 'USD', date, newGoalBalance: goal.balance })
    }
  },

  notes: {
    list: (filter) => {
      let rows = db.notes.filter((n) => (filter?.archived === undefined ? !n.archived : n.archived === filter.archived))
      if (filter?.tag) rows = rows.filter((n) => n.tags.includes(filter.tag!))
      if (filter?.text) {
        const q = filter.text.toLowerCase()
        rows = rows.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q)))
      }
      return tick(clone(rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))))
    },
    get: (idNum) => tick(clone(db.notes.find((n) => n.id === idNum) ?? db.notes[0])),
    create: (input) => {
      const note: typeof db.notes[number] = { ...input, id: id(), createdAt: TODAY, updatedAt: TODAY, wordCount: input.body.split(/\s+/).filter(Boolean).length }
      db.notes.unshift(note)
      return tick(clone(note))
    },
    update: (idNum, input) => {
      const i = db.notes.findIndex((n) => n.id === idNum)
      const note = { ...db.notes[i], ...input, updatedAt: `${TODAY}T12:00:00.000Z`, wordCount: input.body.split(/\s+/).filter(Boolean).length }
      db.notes[i] = note
      return tick(clone(note))
    },
    remove: (idNum) => { db.notes = db.notes.filter((n) => n.id !== idNum); return tick(batch) },
    setPinned: (idNum, pinned) => {
      const note = db.notes.find((n) => n.id === idNum)!
      note.pinned = pinned
      return tick(clone(note))
    },
    setArchived: (idNum, archived) => {
      const note = db.notes.find((n) => n.id === idNum)!
      note.archived = archived
      return tick(clone(note))
    },
    // Backlinks: notes whose body links [[this note's title]] (a tiny, honest approximation).
    backlinks: (idNum) => {
      const target = db.notes.find((n) => n.id === idNum)
      if (!target) return tick([])
      return tick(clone(db.notes.filter((n) => n.id !== idNum && n.body.includes(`[[${target.title}]]`))))
    },
    findByTitle: (title) => tick(clone(db.notes.find((n) => n.title.toLowerCase() === title.toLowerCase()) ?? null)),
    promoteEntry: (entryId) => {
      const entry = db.entries.find((e) => e.id === entryId)!
      const note = { id: id(), title: entry.title, body: entry.body, tags: entry.tags, pinned: false, archived: false, createdAt: TODAY, updatedAt: TODAY }
      db.notes.unshift(note)
      return tick(clone(note))
    }
  },

  content: {
    list: () => tick(clone([...db.content].sort((a, b) => a.position - b.position))),
    get: (idNum) => tick(clone(db.content.find((c) => c.id === idNum) ?? db.content[0])),
    create: (input) => {
      const row = {
        ...input, id: id(), type: input.type, platform: input.platform ?? '', hook: input.hook ?? '', stage: input.stage ?? 'idea' as const,
        position: db.content.length + 1, series: input.series ?? '', tags: input.tags ?? [], targetPublishDate: input.targetPublishDate ?? null,
        publishedDate: input.publishedDate ?? null, publishedUrl: input.publishedUrl ?? null, scriptNoteId: input.scriptNoteId ?? null,
        checklist: input.checklist ?? [], stageDates: input.stageDates ?? {}, assets: input.assets ?? [], streamStart: input.streamStart ?? null,
        streamMinutes: input.streamMinutes ?? null, views24h: input.views24h ?? null, views7d: input.views7d ?? null, postNotes: input.postNotes ?? '',
        createdAt: TODAY, updatedAt: TODAY
      }
      db.content.push(row)
      return tick(clone(row))
    },
    update: (idNum, input) => {
      const i = db.content.findIndex((c) => c.id === idNum)
      const row = { ...db.content[i], ...input, updatedAt: TODAY }
      db.content[i] = row
      return tick(clone(row))
    },
    move: (idNum, stage) => {
      const row = db.content.find((c) => c.id === idNum)!
      row.stage = stage
      row.updatedAt = TODAY
      return tick(clone(row))
    },
    reorder: () => tick(undefined),
    setChecklistDone: (idNum, lineId, done) => {
      const row = db.content.find((c) => c.id === idNum)!
      const line = row.checklist.find((l) => l.id === lineId)
      if (line) line.done = done
      return tick(clone(row))
    },
    addChecklistLine: (idNum, stage, text) => {
      const row = db.content.find((c) => c.id === idNum)!
      row.checklist.push({ id: `${stage}:${row.checklist.length}`, stage, text, done: false })
      return tick(clone(row))
    },
    removeChecklistLine: (idNum, lineId) => {
      const row = db.content.find((c) => c.id === idNum)!
      row.checklist = row.checklist.filter((l) => l.id !== lineId)
      return tick(clone(row))
    },
    setScript: (idNum, noteId) => {
      const row = db.content.find((c) => c.id === idNum)!
      row.scriptNoteId = noteId
      return tick(clone(row))
    },
    createScript: (idNum, title) => {
      const row = db.content.find((c) => c.id === idNum)!
      const note = { id: id(), title, body: `# ${title}\n\n## Hook\n\n## Outline\n`, tags: [], pinned: false, archived: false, createdAt: TODAY, updatedAt: TODAY }
      db.notes.unshift(note)
      row.scriptNoteId = note.id
      return tick(clone(row))
    },
    addAsset: (idNum, asset) => {
      const row = db.content.find((c) => c.id === idNum)!
      row.assets.push(asset)
      return tick(clone(row))
    },
    removeAsset: (idNum, path) => {
      const row = db.content.find((c) => c.id === idNum)!
      row.assets = row.assets.filter((a) => a.path !== path)
      return tick(clone(row))
    },
    remove: (idNum) => { db.content = db.content.filter((c) => c.id !== idNum); return tick(batch) },
    // No filesystem in the browser: nothing is reported missing.
    missingAssets: () => tick([])
  },

  projects: {
    list: (includeArchived) => tick(clone(db.projects.filter((p) => includeArchived || !p.archived))),
    create: (input) => {
      const row = { id: id(), name: input.name, colour: input.colour ?? '#8b5cf6', archived: false, createdAt: TODAY, updatedAt: TODAY, deletedAt: null, deleteBatchId: null }
      db.projects.push(row)
      return tick(clone(row))
    },
    update: (idNum, input) => {
      const i = db.projects.findIndex((p) => p.id === idNum)
      db.projects[i] = { ...db.projects[i], ...input, updatedAt: TODAY }
      return tick(clone(db.projects[i]))
    },
    delete: (idNum) => { db.projects = db.projects.filter((p) => p.id !== idNum); return tick(batch) }
  },

  focus: {
    active: () => tick(null),
    start: (params) => tick({
      taskId: params.taskId ?? null, projectId: params.projectId ?? null, projectName: params.projectName ?? '',
      type: params.type, mode: params.mode, status: 'running' as const, startedAt: `${TODAY}T10:00:00.000Z`,
      targetSeconds: params.targetSeconds, elapsedSeconds: 0, pausedAt: null, round: params.round ?? 1, note: params.note ?? ''
    }),
    pause: () => tick(null),
    resume: () => tick(null),
    stop: () => tick(null),
    discard: () => tick(undefined),
    summary: (today) => tick(focusSummary(db.sessions, today)),
    report: (from, to) => tick(buildFocusReport(db.sessions, db.projects, from, to)),
    listSessions: (filter) => tick(clone(db.sessions.filter((s) => {
      if (filter?.from && s.startedAt.slice(0, 10) < filter.from) return false
      if (filter?.to && s.startedAt.slice(0, 10) > filter.to) return false
      if (filter?.projectId && s.projectId !== filter.projectId) return false
      if (filter?.type && s.type !== filter.type) return false
      return true
    }).sort((a, b) => b.startedAt.localeCompare(a.startedAt)))),
    logManual: (input) => {
      const startMs = Date.parse(input.startedAt)
      const endMs = Date.parse(input.endedAt)
      const row = {
        id: id(), taskId: input.taskId ?? null, projectId: input.projectId ?? null,
        projectName: input.projectName ?? db.projects.find((p) => p.id === input.projectId)?.name ?? '',
        startedAt: input.startedAt, endedAt: input.endedAt, plannedSeconds: input.plannedSeconds ?? 0,
        actualSeconds: input.actualSeconds ?? Math.max(0, Math.round((endMs - startMs) / 1000)),
        type: input.type ?? 'focus', completed: input.completed ?? true, note: input.note ?? '', source: 'manual' as const,
        createdAt: TODAY, updatedAt: TODAY, deletedAt: null, deleteBatchId: null
      }
      db.sessions.unshift(row)
      return tick(clone(row))
    },
    updateSession: (idNum, input) => {
      const i = db.sessions.findIndex((s) => s.id === idNum)
      db.sessions[i] = { ...db.sessions[i], ...input, updatedAt: TODAY }
      return tick(clone(db.sessions[i]))
    },
    deleteSession: (idNum) => { db.sessions = db.sessions.filter((s) => s.id !== idNum); return tick(batch) },
    taskSeconds: (taskId) => tick(db.sessions.filter((s) => s.taskId === taskId).reduce((sum, s) => sum + s.actualSeconds, 0))
  },

  snippets: {
    list: () => tick(clone(db.snippets)),
    create: (input) => {
      const row = { ...input, id: id(), createdAt: TODAY, updatedAt: TODAY }
      db.snippets.unshift(row)
      return tick(clone(row))
    },
    update: (idNum, input) => {
      const i = db.snippets.findIndex((s) => s.id === idNum)
      db.snippets[i] = { ...db.snippets[i], ...input, updatedAt: TODAY }
      return tick(clone(db.snippets[i]))
    },
    remove: (idNum) => { db.snippets = db.snippets.filter((s) => s.id !== idNum); return tick(batch) }
  },

  tools: {
    // The browser has its own clipboard; the OS clipboard belongs to Electron.
    copyText: (text) => { void navigator.clipboard?.writeText(text).catch(() => undefined); return tick(undefined) }
  },

  scratchpads: {
    list: () => tick(clone(db.scratchpads)),
    ensure: () => tick(clone(db.scratchpads[0])),
    create: (input) => {
      const row = { id: id(), name: input.name ?? `Pad ${db.scratchpads.length + 1}`, content: input.content ?? '', position: db.scratchpads.length, createdAt: TODAY, updatedAt: TODAY }
      db.scratchpads.push(row)
      return tick(clone(row))
    },
    update: (idNum, patch) => {
      const pad = db.scratchpads.find((p) => p.id === idNum)!
      Object.assign(pad, patch, { updatedAt: TODAY })
      return tick(clone(pad))
    },
    remove: (idNum) => { db.scratchpads = db.scratchpads.filter((p) => p.id !== idNum); return tick(batch) },
    saveAsNote: (idNum) => {
      const pad = db.scratchpads.find((p) => p.id === idNum)!
      const note = { id: id(), title: pad.name, body: pad.content, tags: [], pinned: false, archived: false, createdAt: TODAY, updatedAt: TODAY }
      db.notes.unshift(note)
      return tick({ id: note.id, title: note.title })
    }
  },

  // Dashboard: the same assembly the main process does, over the fixtures.
  dashboard: {
    summary: (today) => {
      const active = activeTasks()
      const allGoals = db.goals
      return tick({
        recentEntries: clone([...db.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)),
        recentTrades: clone([...db.trades].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)),
        goals: clone(allGoals),
        tradeStats: computeStats(db.trades),
        pnlSeries: pnlSeries(db.trades),
        totalSaved: Math.round(allGoals.reduce((sum, g) => sum + g.balance, 0) * 100) / 100,
        log: {
          total: db.entries.length,
          thisMonth: db.entries.filter((e) => e.date.slice(0, 7) === today.slice(0, 7)).length,
          streak: logStreak(db.entries.map((e) => e.date), today)
        },
        habits: habitsToday(db.habits, TODAY),
        tasks: taskDashboard(active, today),
        focus: focusSummary(db.sessions, today)
      })
    }
  },

  calendar: {
    month: (month, today) => {
      const { start, end } = gridRange(month)
      return tick(buildCalendar({
        month, today,
        entries: db.entries.filter((e) => e.date >= start && e.date <= end),
        trades: db.trades.filter((t) => t.date >= start && t.date <= end),
        txs: db.savingsTx.filter((t) => t.date >= start && t.date <= end).map((t) => ({ ...t, goalName: db.goals.find((g) => g.id === t.goalId)?.name ?? '' })),
        habits: db.habits,
        published: db.content.filter((c) => c.publishedDate && c.publishedDate >= start && c.publishedDate <= end).map((c) => ({ id: c.id, title: c.title, platform: c.platform, date: c.publishedDate! })),
        planned: db.content.filter((c) => c.targetPublishDate && c.targetPublishDate >= start && c.targetPublishDate <= end && !c.publishedDate).map((c) => ({ id: c.id, title: c.title, platform: c.platform, date: c.targetPublishDate! })),
        bills: db.bills.filter((b) => !b.archived && b.nextDueDate >= start && b.nextDueDate <= end).map((b) => ({ id: b.id, name: b.name, amount: b.amount, currency: b.currency, date: b.nextDueDate })),
        focusSessions: db.sessions.flatMap((s) => splitSessionByDay(s.startedAt, s.endedAt).map((slice) => ({ id: s.id, projectName: s.projectName, seconds: slice.seconds, type: s.type, date: slice.date })))
      }))
    }
  },

  briefing: {
    build: (today) => tick(buildBriefing({
      today,
      tasks: activeTasks(),
      habits: db.habits,
      goals: db.goals,
      txs: db.savingsTx,
      trades: db.trades,
      entries: db.entries,
      automations: db.activity as AutomationActivity[],
      overdueDays: 7
    }) as DailyBriefing)
  },

  capture: {
    status: () => tick({ enabled: true, hotkey: 'CommandOrControl+Shift+Space', keepRunning: true, registered: true, platform: 'win32', problem: null }),
    configure: (patch) => tick({ ok: true, error: null, status: { enabled: true, hotkey: patch.hotkey ?? 'CommandOrControl+Shift+Space', keepRunning: true, registered: true, platform: 'win32', problem: null } }),
    open: () => tick(undefined),
    hide: () => tick(undefined),
    openMain: () => tick(undefined),
    resize: () => tick(undefined),
    saved: () => tick(undefined),
    // No other windows in the preview: subscribing is a no-op that returns its unsubscriber.
    onShown: () => () => undefined,
    onDataChanged: () => () => undefined
  },

  review: {
    build: (kind, anchor, today) => {
      const range = kind === 'week' ? weekRange(anchor) : monthRange(anchor)
      const prev = kind === 'week' ? weekRange(addDaysLocal(range.start, -7)) : monthRange(addDaysLocal(range.start, -1))
      return tick(buildReview({
        kind, anchor, today,
        trades: db.trades.filter((t) => t.date >= prev.start && t.date <= range.end),
        goals: db.goals,
        txs: db.savingsTx,
        habits: db.habits,
        tasks: activeTasks(),
        entries: db.entries.filter((e) => e.date >= prev.start && e.date <= range.end),
        expenses: db.expenses.filter((t) => t.date >= prev.start && t.date <= range.end).map((t) => ({ id: t.id, amount: t.amount, date: t.date, type: t.type, categoryId: t.categoryId })),
        categories: db.categories.map((c) => ({ id: c.id, name: c.name })),
        notesCreated: db.notes.filter((n) => n.createdAt.slice(0, 10) >= range.start && n.createdAt.slice(0, 10) <= range.end).length,
        focusSeconds: db.sessions.flatMap((s) => splitSessionByDay(s.startedAt, s.endedAt)).filter((sl) => sl.date >= range.start && sl.date <= range.end).reduce((sum, sl) => sum + sl.seconds, 0),
        contentPublished: db.content.filter((c) => c.publishedDate && c.publishedDate >= range.start && c.publishedDate <= range.end).length
      }))
    }
  },

  search: {
    run: (query, limit) => tick(buildSearchResults(query, limit ?? 8, db))
  },

  trash: {
    list: () => tick(clone(db.trash)),
    restore: (batchId) => { db.trash = db.trash.filter((b) => b.batchId !== batchId); return tick(1) },
    deleteForever: (batchId) => { db.trash = db.trash.filter((b) => b.batchId !== batchId); return tick(1) },
    empty: () => { db.trash = []; return tick(0) }
  },

  links: {
    add: () => tick(id()),
    list: () => tick([]),
    remove: () => tick(undefined)
  },

  tags: {
    list: () => {
      const names = new Set<string>()
      for (const e of db.entries) e.tags.forEach((t) => names.add(t))
      for (const t of db.trades) t.tags.forEach((x) => names.add(x))
      for (const n of db.notes) n.tags.forEach((t) => names.add(t))
      for (const t of activeTasks()) t.tags.forEach((x) => names.add(x))
      return tick([...names].sort().map((name, i) => ({ id: i + 1, name, colour: null, createdAt: TODAY, updatedAt: TODAY })))
    },
    counts: () => {
      const counts = new Map<string, { logbook: number; trade: number; goal: number; task: number; note: number; content: number }>()
      const bump = (tag: string, key: 'logbook' | 'trade' | 'goal' | 'task' | 'note' | 'content') => {
        const row = counts.get(tag) ?? { logbook: 0, trade: 0, goal: 0, task: 0, note: 0, content: 0 }
        row[key] += 1
        counts.set(tag, row)
      }
      db.entries.forEach((e) => e.tags.forEach((t) => bump(t, 'logbook')))
      db.trades.forEach((t) => t.tags.forEach((x) => bump(x, 'trade')))
      activeTasks().forEach((t) => t.tags.forEach((x) => bump(x, 'task')))
      db.notes.forEach((n) => n.tags.forEach((t) => bump(t, 'note')))
      db.content.forEach((c) => c.tags.forEach((t) => bump(t, 'content')))
      return tick([...counts].map(([tag, c], i) => ({ tag: { id: i + 1, name: tag, colour: null, createdAt: TODAY, updatedAt: TODAY }, counts: c })))
    },
    setEntityTags: () => tick(undefined),
    tagsOf: () => tick([]),
    setColour: () => tick(undefined),
    rename: (from, to) => tick({ id: 1, name: to || from, colour: null, createdAt: TODAY, updatedAt: TODAY }),
    merge: (from, into) => tick({ id: 1, name: into, colour: null, createdAt: TODAY, updatedAt: TODAY }),
    delete: () => tick(1),
    items: (name) => tick([
      ...db.entries.filter((e) => e.tags.includes(name)).map((e) => ({ type: 'logbook' as const, id: e.id, label: e.title, sublabel: e.date })),
      ...db.trades.filter((t) => t.tags.includes(name)).map((t) => ({ type: 'trade' as const, id: t.id, label: `${t.asset}, ${t.direction}`, sublabel: t.date })),
      ...activeTasks().filter((t) => t.tags.includes(name)).map((t) => ({ type: 'task' as const, id: t.id, label: t.title })),
      ...db.notes.filter((n) => n.tags.includes(name)).map((n) => ({ type: 'note' as const, id: n.id, label: n.title }))
    ])
  },

  templates: {
    list: (kind) => tick(clone(kind ? db.templates.filter((t) => t.kind === kind) : db.templates)),
    save: (kind, name, payload) => {
      const row = { id: id(), kind, name, payload, isBuiltin: false, createdAt: TODAY, updatedAt: TODAY }
      db.templates.push(row)
      return tick(clone(row))
    },
    remove: (idNum) => { db.templates = db.templates.filter((t) => t.id !== idNum); return tick(undefined) },
    restoreBuiltins: () => tick(clone(db.templates))
  },

  app: {
    dataPath: () => tick('C:\\Users\\Dell\\AppData\\Roaming\\Feeblest\\data\\'),
    openDataFolder: () => tick(undefined)
  },

  // Backups open native dialogs in the app; the preview says so instead.
  backup: {
    exportJson: () => tick(null as ExportResult | null),
    exportTradesCsv: () => tick(null as ExportResult | null),
    chooseImport: () => tick(null as ImportPreview | null),
    applyImport: () => Promise.reject(new Error('Backups are disabled in the design preview.'))
  },

  intelligence: {
    get: () => tick(clone(db.settings.intelligence)),
    set: (features) => {
      db.settings.intelligence = { ...db.settings.intelligence, features: { ...db.settings.intelligence.features, ...features } }
      return tick(clone(db.settings.intelligence))
    },
    automations: {
      get: () => tick(clone(db.automations)),
      set: (patch) => { db.automations = { ...db.automations, ...patch }; return tick(clone(db.automations)) },
      activity: () => tick(clone(db.activity)),
      deleteActivity: (idNum) => { db.activity = db.activity.filter((a) => a.id !== idNum); return tick(undefined) },
      clearActivity: () => { db.activity = []; return tick(undefined) },
      staleTasks: () => tick(activeTasks().filter((t) => t.dueDate && t.dueDate < addDaysLocal(TODAY, -7)).map((t) => ({ id: t.id, title: t.title, daysOverdue: 8 })))
    },
    insights: {
      build: (today) => tick({
        ...buildInsights({
          today, start: addDaysLocal(today, -60), end: today,
          habits: db.habits,
          tasks: activeTasks(),
          completions: [],
          trades: db.trades,
          txs: db.savingsTx,
          entries: db.entries,
          expenses: db.expenses.map((t) => ({ date: t.date, amount: t.amount, type: t.type })),
          notes: db.notes.map((n) => ({ id: n.id, createdAt: n.createdAt })),
          focusSessions: db.sessions.map((s) => ({ startedAt: s.startedAt, endedAt: s.endedAt, type: s.type })),
          contentPublished: db.content.filter((c) => c.publishedDate).map((c) => ({ id: c.id, publishedDate: c.publishedDate! }))
        }),
        dismissed: clone(db.dismissals),
        snoozeWeeks: 4
      }),
      dismiss: (idNum, dismissed, mode, today) => {
        db.dismissals = db.dismissals.filter((d) => d.id !== idNum)
        if (dismissed) db.dismissals.push({ id: idNum, until: mode === 'snooze' ? addDaysLocal(today ?? TODAY, 28) : null })
        return tick(clone(db.dismissals))
      }
    },
    assistant: {
      get: () => tick(clone(db.assistant)),
      set: (patch) => { db.assistant = { ...db.assistant, ...patch }; return tick(clone(db.assistant)) },
      keyStatus: () => tick({ saved: false, readable: false, encryptionOk: true }),
      setKey: () => tick({ ok: true as const }),
      clearKey: () => tick(undefined),
      functions: () => tick([
        { name: 'trade_pnl', description: 'Closed-trade profit and loss', examples: ['How much did I make on trades this month?'], supports: ['asset', 'tag'], unit: 'money', resultType: 'number', supportsLimit: false },
        { name: 'savings_balance', description: 'Savings balance across goals', examples: ['What is my savings balance?'], supports: [], unit: 'money', resultType: 'number', supportsLimit: false },
        { name: 'habits_done', description: 'Habit check-ins in a range', examples: ['How many habits did I complete last week?'], supports: ['habit'], unit: 'count', resultType: 'number', supportsLimit: false },
        { name: 'time_spent', description: 'Focus time by project', examples: ['How long did I focus on Site this week?'], supports: ['project'], unit: 'count', resultType: 'number', supportsLimit: false },
        { name: 'task_list', description: 'Open tasks as a list', examples: ['Which tasks are overdue?'], supports: ['project', 'tag'], unit: 'count', resultType: 'list', supportsLimit: true }
      ]),
      ask: (question) => tick({
        ok: true as const,
        exchange: {
          question,
          answer: '4 of 5 habits were done last week.',
          at: `${TODAY}T10:00:00.000Z`,
          disclosure: {
            question, systemPromptChars: 1840, userPromptChars: question.length, previousRequestSent: null,
            kind: 'computed' as const, functionName: 'habits_done', unit: 'count' as const,
            rangeSpec: { kind: 'last_week' as const }, range: { from: addDaysLocal(TODAY, -7), to: TODAY },
            filters: { sent: {}, matched: {}, ignored: [] },
            result: { type: 'number' as const, value: 4 }, compare: null, previousRange: null, previousResult: null
          }
        }
      })
    }
  },

  calculator: {
    saveHistory: (item) => {
      const row = { ...item, id: `h${db.calcHistory.length + 1}`, createdAt: `${TODAY}T10:00:00.000Z` }
      db.calcHistory.unshift(row)
      return tick(clone(row))
    },
    listHistory: (limit) => tick(clone(db.calcHistory.slice(0, limit ?? 50))),
    clearHistory: () => { db.calcHistory = []; return tick(undefined) },
    deleteHistoryItem: (idStr) => { db.calcHistory = db.calcHistory.filter((h) => h.id !== idStr); return tick(undefined) },
    togglePinHistory: (idStr) => {
      const row = db.calcHistory.find((h) => h.id === idStr)
      if (row) row.pinned = !row.pinned
      return tick(undefined)
    },
    saveVariable: (name, value) => { (db.calculatorSettings as Record<string, unknown>)[`var:${name}`] = value; return tick(undefined) },
    listVariables: () => tick({}),
    deleteVariable: () => tick(undefined),
    saveProgram: (program) => {
      const row = { ...program, id: program.id ?? `p${db.programs.length + 1}`, createdAt: `${TODAY}T10:00:00.000Z`, updatedAt: `${TODAY}T10:00:00.000Z` }
      db.programs.push(row)
      return tick(clone(row))
    },
    listPrograms: () => tick(clone(db.programs)),
    deleteProgram: (idStr) => { db.programs = db.programs.filter((p) => p.id !== idStr); return tick(undefined) },
    saveRateSet: (rateSet) => {
      const row = { ...rateSet, id: rateSet.id ?? `rs${db.rateSets.length + 1}`, updatedAt: `${TODAY}T10:00:00.000Z` }
      db.rateSets.push(row)
      return tick(clone(row))
    },
    renameRateSet: (idStr, newName) => {
      const row = db.rateSets.find((r) => r.id === idStr)!
      row.name = newName
      return tick(clone(row))
    },
    deleteRateSet: (idStr) => { db.rateSets = db.rateSets.filter((r) => r.id !== idStr); return tick(undefined) },
    selectRateSet: () => tick(undefined),
    listRateSets: () => tick(clone(db.rateSets)),
    saveRate: (rate) => {
      const row = { ...rate, id: rate.id ?? `r${db.rates.length + 1}`, updatedAt: `${TODAY}T10:00:00.000Z` }
      db.rates.push(row)
      return tick(clone(row))
    },
    updateRate: (idStr, rateToBase, note, name) => {
      const row = db.rates.find((r) => r.id === idStr)!
      row.rateToBase = rateToBase
      if (note !== undefined) row.note = note
      if (name !== undefined) row.name = name
      return tick(clone(row))
    },
    listRates: (rateSetId) => tick(clone(db.rates.filter((r) => r.rateSetId === rateSetId))),
    saveRateOverride: (override) => {
      const row = { ...override, id: override.id ?? `o${db.overrides.length + 1}`, updatedAt: `${TODAY}T10:00:00.000Z` }
      db.overrides.push(row)
      return tick(clone(row))
    },
    listRateOverrides: (rateSetId) => tick(clone(db.overrides.filter((o) => o.rateSetId === rateSetId))),
    deleteRateOverride: (idStr) => { db.overrides = db.overrides.filter((o) => o.id !== idStr); return tick(undefined) },
    importRateSet: (_idStr, rows) => tick({ count: rows.length }),
    getSetting: (key) => tick((db.calculatorSettings as Record<string, unknown>)[key as string] as never),
    setSetting: (key, value) => { (db.calculatorSettings as Record<string, unknown>)[key as string] = value; return tick(undefined) },
    getAllSettings: () => tick(clone(db.calculatorSettings) as never)
  }
}

// ---------- small date helpers (UTC, so a time zone can never shift a day) ----------

function addDaysLocal(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
}

function weekRange(anchor: string): { start: string; end: string } {
  const [y, m, d] = anchor.split('-').map(Number)
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  const start = addDaysLocal(anchor, -dow)
  return { start, end: addDaysLocal(start, 6) }
}

function monthRange(anchor: string): { start: string; end: string } {
  const first = `${anchor.slice(0, 7)}-01`
  const [y, m] = first.split('-').map(Number)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { start: first, end }
}

// ---------- installation ----------

/**
 * Puts the fake API on `window` before the app renders. Returns the fake for tests/tools.
 * `empty` (?empty=1) starts every list empty, so each page's empty state can be looked at;
 * the sample scalars (today, settings) stay, because the empty state must still be reachable.
 */
export function installFakeApi(empty = false): EverythingApi {
  if (empty) {
    db.entries = []
    db.trades = []
    db.goals = []
    db.savingsTx = []
    db.tasks = []
    db.trashTasks = []
    db.habits = []
    db.notes = []
    db.content = []
    db.expenses = []
    db.budgets = []
    db.categories = []
    db.bills = []
    db.sessions = []
    db.projects = []
    db.snippets = []
    db.scratchpads = []
    db.templates = []
    db.trash = []
    db.activity = []
  }
  ;(window as unknown as { api: EverythingApi }).api = api
  return api
}

export { api as fakeApi, db as fakeDb, taskWeekStart, addTaskDays }
