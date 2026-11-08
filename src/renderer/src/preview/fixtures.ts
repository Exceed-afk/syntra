// ---------------------------------------------------------------------------
// SAMPLE DATA for the design preview harness (npm run preview, npm run shots).
//
// Everything in this folder is PREVIEW-ONLY. electron-vite never builds it: it
// is reachable only from src/renderer/preview.html. Nothing here is imported by
// the app, and the harness never touches the real database.
//
// The data is DETERMINISTIC: every date is worked out from a fixed "today"
// (TODAY below), never from the machine clock, so two runs render the same
// screens and screenshots can be compared. Ids are fixed numbers.
//
// Shapes are the app's real shared types (src/shared/*), so what renders here
// is what the app renders.
// ---------------------------------------------------------------------------
import type { Habit, LogEntry, SavingsGoal, SavingsTx, Task, Trade } from '../../../shared/types'
import type { ContentItem } from '../../../shared/content'
import type { ExpenseBudget, ExpenseCategory, ExpenseTransaction, RecurringBill } from '../../../modules/expenses/service/types'
import { MOOD_SCORE } from '../../../shared/types'
import type { TimeSession, Project } from '../../../shared/focus'
import type { Note } from '../../../shared/notes'
import type { Template } from '../../../shared/templates'
import type { Snippet, Scratchpad } from '../../../shared/toolsData'
import type { TrashBatch } from '../../../shared/trash'

/** The fixed "today" of the whole preview: a Thursday. */
export const TODAY = '2026-11-05'
export const NOW_ISO = `${TODAY}T10:24:00.000Z`

// ---------- date helpers (UTC only, so no time zone can shift a day) ----------

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
}

export function weekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // 0 = Monday
}

/** A small deterministic pseudo-random generator: the same numbers on every run. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const stamp = (date: string, time = '18:30'): string => `${date}T${time}:00.000Z`

// ---------- logbook ----------

const ENTRY_SEEDS: { dayOffset: number; title: string; body: string; mood: LogEntry['mood']; tags: string[] }[] = [
  { dayOffset: 0, title: 'A calmer start than usual', body: 'Woke before the alarm, wrote three pages, then the market opened flat. No trades yet — this is the first Thursday in a while where I am not forcing a setup.', mood: 'good', tags: ['routine', 'trading'] },
  { dayOffset: -1, title: 'Rough day, honest notes', body: 'Overtraded the gold open and gave back the week. Sat with it instead of opening another chart.', mood: 'low', tags: ['trading', 'reflection'] },
  { dayOffset: -2, title: 'Twenty pages and a long walk', body: 'Left the phone at home. The walk was better than the book.', mood: 'great', tags: ['reading', 'health'] },
  { dayOffset: -3, title: 'Weekly review draft', body: 'Three wins, one thing to change. The plan for next week is written down.', mood: 'good', tags: ['review'] },
  { dayOffset: -4, title: 'Quiet Sunday', body: 'Meal prep, laundry, a film. Nothing tracked, nothing missed.', mood: 'okay', tags: ['home'] },
  { dayOffset: -5, title: 'Weak close on the index', body: 'Closed the equity trade at the target and left one open.', mood: 'okay', tags: ['trading'] },
  { dayOffset: -6, title: 'Back to the gym', body: 'First session after two weeks off. Kept it short.', mood: 'good', tags: ['health'] },
  { dayOffset: -7, title: 'Rough week, better plan', body: 'Too many trades on Monday. Wrote a rule: no more than three per day.', mood: 'rough', tags: ['trading', 'reflection'] },
  { dayOffset: -9, title: 'Script notes for the next video', body: 'Hook needs work. The middle is fine.', mood: 'okay', tags: ['content'] },
  { dayOffset: -11, title: 'Long focus block', body: 'Two pomodoros on the new note system and it finally clicked.', mood: 'great', tags: ['focus'] },
  { dayOffset: -14, title: 'October in review', body: 'Saved 420, made 380 on the broker, read four books.', mood: 'good', tags: ['review'] },
  { dayOffset: -18, title: 'Sick day', body: 'Stayed in bed. Skipped the habits, no guilt.', mood: 'low', tags: ['health'] },
  { dayOffset: -24, title: 'New goal: Japan trip', body: 'Set a target of 2,000 for spring. 1,380 in already.', mood: 'good', tags: ['money'] },
  { dayOffset: -31, title: 'A full month of mornings', body: 'Thirty days of morning pages. It shows in the calm of the journal.', mood: 'great', tags: ['routine'] }
]

export const entries: LogEntry[] = ENTRY_SEEDS.map((e, i) => {
  const date = addDays(TODAY, e.dayOffset)
  return {
    id: 100 + i, date, title: e.title, body: e.body, mood: e.mood, tags: e.tags,
    createdAt: stamp(date), updatedAt: stamp(date)
  }
})

// ---------- trades ----------

const TRADE_SEEDS: { offset: number; asset: string; dir: 'long' | 'short'; entry: number; exit: number | null; qty: number; fees: number; tags: string[]; notes: string }[] = [
  { offset: 0, asset: 'XAUUSD', dir: 'long', entry: 2642.5, exit: null, qty: 0.1, fees: 2.1, tags: ['gold', 'breakout'], notes: 'Breakout setup, half size' },
  { offset: -1, asset: 'XAUUSD', dir: 'long', entry: 2631.0, exit: 2646.2, qty: 0.2, fees: 4.2, tags: ['gold'], notes: 'Waited for the retest' },
  { offset: -1, asset: 'EURUSD', dir: 'short', entry: 1.0884, exit: 1.0911, qty: 0.5, fees: 3.0, tags: [], notes: 'Chased it' },
  { offset: -1, asset: 'US500', dir: 'long', entry: 5120.0, exit: 5104.5, qty: 0.3, fees: 2.4, tags: ['index'], notes: 'Overtrade' },
  { offset: -2, asset: 'BTCUSD', dir: 'long', entry: 68210, exit: 69140, qty: 0.02, fees: 8.5, tags: ['crypto'], notes: 'Plan followed' },
  { offset: -3, asset: 'GBPJPY', dir: 'short', entry: 191.40, exit: 190.55, qty: 0.1, fees: 2.0, tags: ['fx'], notes: 'Clean trend day' },
  { offset: -3, asset: 'XAUUSD', dir: 'short', entry: 2650.0, exit: 2641.8, qty: 0.1, fees: 2.1, tags: ['gold'], notes: '' },
  { offset: -5, asset: 'US500', dir: 'long', entry: 5080, exit: 5096.4, qty: 0.4, fees: 3.1, tags: ['index'], notes: 'Held to target' },
  { offset: -6, asset: 'BTCUSD', dir: 'short', entry: 67100, exit: 67420, qty: 0.02, fees: 8.2, tags: ['crypto'], notes: 'Fader against the trend' },
  { offset: -7, asset: 'XAUUSD', dir: 'long', entry: 2620, exit: 2633.4, qty: 0.1, fees: 2.0, tags: ['gold'], notes: '' },
  { offset: -7, asset: 'EURUSD', dir: 'long', entry: 1.0812, exit: 1.0798, qty: 0.6, fees: 3.2, tags: [], notes: 'Late entry' },
  { offset: -8, asset: 'GBPJPY', dir: 'long', entry: 190.1, exit: 190.95, qty: 0.1, fees: 2.0, tags: ['fx'], notes: '' },
  { offset: -9, asset: 'US500', dir: 'short', entry: 5110, exit: 5102.2, qty: 0.3, fees: 2.5, tags: ['index'], notes: '' },
  { offset: -10, asset: 'XAUUSD', dir: 'long', entry: 2608, exit: 2619, qty: 0.1, fees: 2.0, tags: ['gold'], notes: 'A-plan' },
  { offset: -12, asset: 'BTCUSD', dir: 'long', entry: 65400, exit: 64890, qty: 0.03, fees: 9.0, tags: ['crypto'], notes: 'Sized up, lost' },
  { offset: -13, asset: 'EURUSD', dir: 'short', entry: 1.0931, exit: 1.0897, qty: 0.5, fees: 3.0, tags: [], notes: '' },
  { offset: -15, asset: 'XAUUSD', dir: 'long', entry: 2596, exit: 2610.5, qty: 0.1, fees: 2.0, tags: ['gold', 'breakout'], notes: '' },
  { offset: -16, asset: 'GBPJPY', dir: 'short', entry: 192.2, exit: 192.9, qty: 0.1, fees: 2.0, tags: ['fx'], notes: 'Stop respected' },
  { offset: -18, asset: 'US500', dir: 'long', entry: 5024, exit: 5041.3, qty: 0.4, fees: 3.2, tags: ['index'], notes: '' },
  { offset: -19, asset: 'XAUUSD', dir: 'short', entry: 2615, exit: 2609.1, qty: 0.1, fees: 2.0, tags: ['gold'], notes: '' },
  { offset: -21, asset: 'BTCUSD', dir: 'long', entry: 63900, exit: 65500, qty: 0.02, fees: 8.1, tags: ['crypto'], notes: 'Big one' },
  { offset: -23, asset: 'EURUSD', dir: 'long', entry: 1.0761, exit: 1.0752, qty: 0.5, fees: 3.0, tags: [], notes: '' },
  { offset: -25, asset: 'XAUUSD', dir: 'long', entry: 2571, exit: 2584.2, qty: 0.1, fees: 2.0, tags: ['gold'], notes: '' },
  { offset: -27, asset: 'GBPJPY', dir: 'long', entry: 188.4, exit: 189.3, qty: 0.1, fees: 2.0, tags: ['fx'], notes: '' },
  { offset: -30, asset: 'US500', dir: 'long', entry: 4962, exit: 4989.7, qty: 0.3, fees: 2.6, tags: ['index'], notes: '' },
  { offset: -33, asset: 'XAUUSD', dir: 'short', entry: 2588, exit: 2594.6, qty: 0.1, fees: 2.0, tags: ['gold'], notes: 'Revenge trade' },
  { offset: -36, asset: 'BTCUSD', dir: 'long', entry: 61100, exit: 62440, qty: 0.02, fees: 7.9, tags: ['crypto'], notes: '' }
]

const pnlOf = (t: { dir: 'long' | 'short'; entry: number; exit: number | null; qty: number; fees: number }): number | null =>
  t.exit === null ? null : Math.round(((t.dir === 'long' ? t.exit - t.entry : t.entry - t.exit) * t.qty - t.fees) * 100) / 100

export const trades: Trade[] = TRADE_SEEDS.map((t, i) => {
  const date = addDays(TODAY, t.offset)
  return {
    id: 200 + i, date, asset: t.asset, direction: t.dir, entryPrice: t.entry, exitPrice: t.exit,
    quantity: t.qty, fees: t.fees, notes: t.notes, tags: t.tags,
    pnl: pnlOf(t), closedAt: t.exit === null ? null : stamp(date, '21:10'),
    createdAt: stamp(date, '09:30'), updatedAt: stamp(date, '21:10')
  }
})

// ---------- savings ----------

const GOAL_SEEDS: { name: string; target: number | null; notes: string }[] = [
  { name: 'Emergency fund', target: 7000, notes: 'Six months of bare costs.' },
  { name: 'Japan trip', target: 2000, notes: 'Spring, two weeks, just the two of us.' },
  { name: 'New desk chair', target: 450, notes: 'Replaced the old one. Done.' },
  { name: 'Everyday account', target: null, notes: 'No target, just the balance.' }
]

const TX_SEEDS: { goal: number; offset: number; kind: 'deposit' | 'withdrawal'; amount: number; note: string }[] = [
  { goal: 1, offset: -118, kind: 'deposit', amount: 1200, note: 'Opening balance' },
  { goal: 1, offset: -52, kind: 'deposit', amount: 300, note: 'Month 1' },
  { goal: 1, offset: -25, kind: 'deposit', amount: 300, note: 'Month 2' },
  { goal: 1, offset: -3, kind: 'deposit', amount: 250, note: 'Month 3' },
  { goal: 1, offset: -1, kind: 'deposit', amount: 150, note: 'Payday top-up' },
  { goal: 2, offset: -96, kind: 'deposit', amount: 900, note: 'Start' },
  { goal: 2, offset: -40, kind: 'deposit', amount: 200, note: '' },
  { goal: 2, offset: -18, kind: 'deposit', amount: 300, note: 'Birthday money' },
  { goal: 2, offset: -6, kind: 'withdrawal', amount: 120, note: 'Flights deposit' },
  { goal: 3, offset: -70, kind: 'deposit', amount: 200, note: '' },
  { goal: 3, offset: -30, kind: 'deposit', amount: 260, note: 'Then bought it' },
  { goal: 3, offset: -28, kind: 'withdrawal', amount: 460, note: 'Herman Miller, used' },
  { goal: 4, offset: -60, kind: 'deposit', amount: 850, note: 'Paycheck' },
  { goal: 4, offset: -4, kind: 'withdrawal', amount: 300, note: 'Rent share' }
]

export const savingsTx: SavingsTx[] = TX_SEEDS.map((t, i) => {
  const date = addDays(TODAY, t.offset)
  return { id: 300 + i, goalId: 400 + t.goal - 1, date, kind: t.kind, amount: t.amount, note: t.note, createdAt: stamp(date), updatedAt: stamp(date) }
})

export const goals: SavingsGoal[] = GOAL_SEEDS.map((g, i) => {
  const id = 400 + i
  const mine = savingsTx.filter((t) => t.goalId === id)
  const balance = mine.reduce((sum, t) => sum + (t.kind === 'deposit' ? t.amount : -t.amount), 0)
  return {
    id, name: g.name, target: g.target, notes: g.notes, balance: Math.round(balance * 100) / 100,
    txCount: mine.length, createdAt: stamp(addDays(TODAY, -120)), updatedAt: stamp(TODAY)
  }
})

// ---------- habits (six months of check-ins) ----------

export interface HabitSeed {
  name: string
  days: number[] // 0 = Monday
  type: Habit['type']
  target: number | null
  unit: string
  timeOfDay: Habit['timeOfDay']
  rate: number // share of due days done
  reminder: string | null
}

export const HABIT_SEEDS: HabitSeed[] = [
  { name: 'Morning pages', days: [0, 1, 2, 3, 4], type: 'check', target: null, unit: '', timeOfDay: 'morning', rate: 0.82, reminder: '07:30' },
  { name: 'Read 20 pages', days: [0, 1, 2, 3, 4, 5, 6], type: 'check', target: null, unit: '', timeOfDay: 'evening', rate: 0.74, reminder: null },
  { name: 'Train', days: [0, 2, 4, 5], type: 'check', target: null, unit: '', timeOfDay: 'afternoon', rate: 0.66, reminder: '17:00' },
  { name: 'Meditate 10 min', days: [0, 1, 2, 3, 4, 5, 6], type: 'duration', target: 10, unit: 'min', timeOfDay: 'morning', rate: 0.58, reminder: null },
  { name: 'No phone before 9', days: [0, 1, 2, 3, 4], type: 'check', target: null, unit: '', timeOfDay: 'morning', rate: 0.45, reminder: null },
  { name: 'Walk 3 times', days: [1, 3, 6], type: 'count', target: 3, unit: 'walks', timeOfDay: 'afternoon', rate: 0.5, reminder: null },
  { name: 'Old journal habit', days: [1, 3], type: 'check', target: null, unit: '', timeOfDay: 'evening', rate: 0.3, reminder: null }
]

export const HABIT_START = addDays(TODAY, -182)

export function habitCompletionsFor(seed: HabitSeed, index: number): { date: string; status: 'done' | 'skipped'; value?: number }[] {
  const rand = seeded(9001 + index * 37)
  const out: { date: string; status: 'done' | 'skipped'; value?: number }[] = []
  for (let offset = -182; offset <= 0; offset++) {
    const date = addDays(TODAY, offset)
    if (!seed.days.includes(weekday(date))) continue
    if (offset === 0 && index % 3 === 0) continue // a few still open today
    const r = rand()
    // A gentle trend upward, so recent weeks look better than older ones.
    const boost = offset > -30 ? 0.12 : 0
    if (r < 0.04) { out.push({ date, status: 'skipped' }); continue }
    if (r < seed.rate + boost) {
      const value = seed.type === 'check' ? undefined : seed.type === 'duration' ? seed.target! : seed.target!
      out.push({ date, status: 'done', ...(value === undefined ? {} : { value }) })
    }
  }
  return out
}

// ---------- tasks ----------

const SUB = (taskId: number, list: string[], doneCount: number) =>
  list.map((title, i) => ({ id: taskId * 10 + i + 1, taskId, title, done: i < doneCount, sortOrder: i }))

export const tasks: Task[] = [
  // Overdue
  { id: 501, title: 'File the Q3 receipts', notes: 'The pile on the desk.', status: 'todo', priority: 'high', dueDate: addDays(TODAY, -9), dueTime: null, createdAt: stamp(addDays(TODAY, -20)), completedAt: null, deletedAt: null, project: 'Admin', tags: ['admin'], position: 1, recurrenceRule: null, recurrenceNext: null, subtasks: SUB(501, ['Scan the paper ones', 'Tag them in Expenses'], 1) },
  { id: 502, title: 'Renew domain and SSL', notes: '', status: 'in-progress', priority: 'high', dueDate: addDays(TODAY, -3), dueTime: '12:00', createdAt: stamp(addDays(TODAY, -12)), completedAt: null, deletedAt: null, project: 'Site', tags: ['site'], position: 2, recurrenceRule: null, recurrenceNext: null, subtasks: [] },
  { id: 503, title: 'Book the dentist', notes: 'Six-month check, overdue by a month.', status: 'todo', priority: 'medium', dueDate: addDays(TODAY, -1), dueTime: null, createdAt: stamp(addDays(TODAY, -30)), completedAt: null, deletedAt: null, project: null, tags: ['health'], position: 3, recurrenceRule: null, recurrenceNext: null, subtasks: [] },
  // Today
  { id: 504, title: 'Write the October review', notes: 'Use the Review page, then save the reflection.', status: 'todo', priority: 'high', dueDate: TODAY, dueTime: '17:00', createdAt: stamp(addDays(TODAY, -2)), completedAt: null, deletedAt: null, project: 'Journal', tags: ['review', 'writing'], position: 4, recurrenceRule: { frequency: 'monthly', intervalDays: 30 }, recurrenceNext: addDays(TODAY, 30), subtasks: SUB(504, ['Pull the numbers', 'Write three wins', 'Write one change'], 1) },
  { id: 505, title: 'Deep work: calculator docs', notes: '', status: 'in-progress', priority: 'medium', dueDate: TODAY, dueTime: '11:00', createdAt: stamp(addDays(TODAY, -1)), completedAt: null, deletedAt: null, project: 'Site', tags: ['focus', 'writing'], position: 5, recurrenceRule: { frequency: 'daily', intervalDays: 1 }, recurrenceNext: addDays(TODAY, 1), subtasks: SUB(505, ['Outline', 'Draft section 1', 'Draft section 2'], 2) },
  { id: 506, title: 'Plan next week', notes: '', status: 'todo', priority: 'low', dueDate: TODAY, dueTime: null, createdAt: stamp(TODAY), completedAt: null, deletedAt: null, project: null, tags: [], position: 6, recurrenceRule: { frequency: 'weekly', intervalDays: 7 }, recurrenceNext: addDays(TODAY, 7), subtasks: [] },
  // Upcoming
  { id: 507, title: 'Record the savings video', notes: 'Short, 6 minutes.', status: 'todo', priority: 'medium', dueDate: addDays(TODAY, 2), dueTime: '09:00', createdAt: stamp(addDays(TODAY, -4)), completedAt: null, deletedAt: null, project: 'Channel', tags: ['content'], position: 7, recurrenceRule: null, recurrenceNext: null, subtasks: SUB(507, ['Audio check', 'Lighting check', 'Test take'], 0) },
  { id: 508, title: 'Weekly review, week of Nov 2', notes: '', status: 'todo', priority: 'medium', dueDate: addDays(TODAY, 3), dueTime: null, createdAt: stamp(addDays(TODAY, -7)), completedAt: null, deletedAt: null, project: 'Admin', tags: ['review', 'weekly'], position: 8, recurrenceRule: { frequency: 'weekly', intervalDays: 7 }, recurrenceNext: addDays(TODAY, 3), subtasks: [] },
  { id: 509, title: 'Compare two savings accounts', notes: 'Rates change on the 15th.', status: 'todo', priority: 'low', dueDate: addDays(TODAY, 6), dueTime: null, createdAt: stamp(addDays(TODAY, -10)), completedAt: null, deletedAt: null, project: 'Money', tags: ['money'], position: 9, recurrenceRule: null, recurrenceNext: null, subtasks: [] },
  // No date
  { id: 510, title: 'Sort the photo library', notes: '', status: 'todo', priority: 'low', dueDate: null, dueTime: null, createdAt: stamp(addDays(TODAY, -40)), completedAt: null, deletedAt: null, project: null, tags: ['home'], position: 10, recurrenceRule: null, recurrenceNext: null, subtasks: [] },
  // Done (this week and before)
  { id: 511, title: 'Pay the electricity bill', notes: '', status: 'done', priority: 'medium', dueDate: addDays(TODAY, -2), dueTime: null, createdAt: stamp(addDays(TODAY, -14)), completedAt: stamp(addDays(TODAY, -2), '20:10'), deletedAt: null, project: 'Admin', tags: ['bills'], position: 11, recurrenceRule: null, recurrenceNext: null, subtasks: [] },
  { id: 512, title: 'Publish the logbook explainer', notes: '', status: 'done', priority: 'high', dueDate: addDays(TODAY, -4), dueTime: '15:00', createdAt: stamp(addDays(TODAY, -18)), completedAt: stamp(addDays(TODAY, -4), '15:22'), deletedAt: null, project: 'Channel', tags: ['content'], position: 12, recurrenceRule: null, recurrenceNext: null, subtasks: SUB(512, ['Thumbnail', 'Description', 'Schedule'], 3) },
  { id: 513, title: 'Close open tasks that no longer matter', notes: '', status: 'done', priority: 'low', dueDate: null, dueTime: null, createdAt: stamp(addDays(TODAY, -8)), completedAt: stamp(addDays(TODAY, -3), '10:00'), deletedAt: null, project: null, tags: [], position: 13, recurrenceRule: null, recurrenceNext: null, subtasks: [] }
]

export const trashTasks: Task[] = [
  { id: 550, title: 'Old task from the board', notes: 'Superseded.', status: 'todo', priority: 'low', dueDate: null, dueTime: null, createdAt: stamp(addDays(TODAY, -50)), completedAt: null, deletedAt: stamp(addDays(TODAY, -6)), project: null, tags: [], position: 1, recurrenceRule: null, recurrenceNext: null, subtasks: [] }
]

// ---------- notes ----------

export const notes: Note[] = [
  {
    id: 601, title: 'Habit system, v2', pinned: true, archived: false, tags: ['system', 'habits'], createdAt: stamp(addDays(TODAY, -30)), updatedAt: stamp(addDays(TODAY, -1)),
    body: [
      '# Habit system, v2',
      '',
      'Keep it to five habits. See [[Reading list]] for the reading habit and [[Weekly template]].',
      '',
      '- [x] Morning pages before the phone',
      '- [x] Read 20 pages',
      '- [ ] Train four times',
      '- [ ] Walk three times',
      '',
      'Link ideas with [[Meeting with Thursday 2026-11-05]] when they come up in a meeting.'
    ].join('\n'),
    wordCount: 62, checklistDone: 2, checklistTotal: 4
  },
  {
    id: 602, title: 'Reading list', pinned: false, archived: false, tags: ['reading'], createdAt: stamp(addDays(TODAY, -60)), updatedAt: stamp(addDays(TODAY, -3)),
    body: ['# Reading list', '', '## Now', '', '- The Art of Noticing', '- Deep Work', '', '## Next', '', '- Four Thousand Weeks', '', 'Part of [[Habit system, v2]]. #reading'].join('\n'),
    wordCount: 18, checklistDone: 0, checklistTotal: 0
  },
  {
    id: 603, title: 'Weekly template', pinned: false, archived: false, tags: ['review'], createdAt: stamp(addDays(TODAY, -45)), updatedAt: stamp(addDays(TODAY, -10)),
    body: ['# Weekly template', '', '## Wins', '', '- ', '', '## Changes', '', '- ', '', 'Used by [[Habit system, v2]].'].join('\n'),
    wordCount: 12, checklistDone: 0, checklistTotal: 0
  },
  {
    id: 604, title: 'Meeting with Thursday 2026-11-05', pinned: false, archived: false, tags: ['work'], createdAt: stamp(TODAY), updatedAt: stamp(TODAY),
    body: ['## Attendees', '', '- Dana, Sam', '', '## Agenda', '', '- [ ] Pricing change', '- [ ] Review cycle', '', '## Notes', '', 'Dana wants the report by Monday.', '', '## Actions', '', '- [ ] Send the report', '', 'See [[Habit system, v2]] for the follow-up.'].join('\n'),
    wordCount: 34, checklistDone: 0, checklistTotal: 2
  },
  {
    id: 605, title: 'Old draft (archived)', pinned: false, archived: true, tags: ['draft'], createdAt: stamp(addDays(TODAY, -90)), updatedAt: stamp(addDays(TODAY, -80)),
    body: '# Old draft (archived)\n\nNot needed any more.', wordCount: 6, checklistDone: 0, checklistTotal: 0
  }
]

// ---------- content ----------

const CHECK = (stage: ContentItem['stage'], texts: string[], doneCount: number): ContentItem['checklist'] =>
  texts.map((text, i) => ({ id: `${stage}:${i}`, stage, text, done: i < doneCount }))

export const content: ContentItem[] = [
  {
    id: 701, title: 'Why I track everything by hand', type: 'video', platform: 'YouTube', hook: 'Spreadsheets are not the problem.', stage: 'idea', position: 1, series: 'Systems', tags: ['systems'], targetPublishDate: null, publishedDate: null, publishedUrl: null, scriptNoteId: null,
    checklist: CHECK('idea', ['Capture the idea in one sentence', 'Note who it is for and why it matters'], 1), stageDates: {}, assets: [], streamStart: null, streamMinutes: null, views24h: null, views7d: null, postNotes: '',
    createdAt: stamp(addDays(TODAY, -9)), updatedAt: stamp(addDays(TODAY, -2)), checklistDone: 1, checklistTotal: 2
  },
  {
    id: 702, title: 'Three habits that survived a bad week', type: 'short', platform: 'TikTok', hook: 'Nothing fancy. Just small.', stage: 'script', position: 1, series: 'Habits', tags: ['habits'], targetPublishDate: addDays(TODAY, 9), publishedDate: null, publishedUrl: null, scriptNoteId: 602,
    checklist: [...CHECK('idea', ['Capture the idea in one sentence', 'Note who it is for and why it matters'], 2), ...CHECK('script', ['Write the hook first', 'Outline the middle', 'Plan the call to action'], 2)], stageDates: { script: addDays(TODAY, -2) }, assets: [], streamStart: null, streamMinutes: null, views24h: null, views7d: null, postNotes: '',
    createdAt: stamp(addDays(TODAY, -14)), updatedAt: stamp(addDays(TODAY, -2)), checklistDone: 2, checklistTotal: 3, scriptNoteTitle: 'Reading list'
  },
  {
    id: 703, title: 'Savings tour: the boring version', type: 'video', platform: 'YouTube', hook: 'Here is the account nobody films.', stage: 'record', position: 1, series: 'Money', tags: ['money'], targetPublishDate: addDays(TODAY, 4), publishedDate: null, publishedUrl: null, scriptNoteId: null,
    checklist: [...CHECK('record', ['Audio check', 'Lighting check', 'Backups running', 'Do a test take'], 3)], stageDates: { record: TODAY }, assets: [{ path: 'C:/Users/Dell/Videos/raw/savings-tour-take2.mp4', label: 'take2.mp4', kind: 'video' }, { path: 'C:/Users/Dell/Videos/raw/thumb.png', label: 'thumb.png', kind: 'image' }], streamStart: null, streamMinutes: null, views24h: null, views7d: null, postNotes: '',
    createdAt: stamp(addDays(TODAY, -21)), updatedAt: stamp(TODAY), checklistDone: 3, checklistTotal: 4
  },
  {
    id: 704, title: 'Friday build stream', type: 'stream', platform: 'Twitch', hook: 'Building the notes page live.', stage: 'edit', position: 1, series: 'Streams', tags: ['build'], targetPublishDate: addDays(TODAY, 2), publishedDate: null, publishedUrl: null, scriptNoteId: null,
    checklist: CHECK('edit', ['Cut dead air', 'Captions', 'Thumbnail', 'Watch it end to end'], 1), stageDates: { edit: TODAY }, assets: [], streamStart: `${addDays(TODAY, 2)}T19:00`, streamMinutes: 120, views24h: null, views7d: null, postNotes: '',
    createdAt: stamp(addDays(TODAY, -5)), updatedAt: stamp(TODAY), checklistDone: 1, checklistTotal: 4
  },
  {
    id: 705, title: 'Newsletter: October recap', type: 'post', platform: 'Substack', hook: 'The month in four numbers.', stage: 'publish', position: 1, series: 'Newsletter', tags: ['writing'], targetPublishDate: addDays(TODAY, 1), publishedDate: null, publishedUrl: null, scriptNoteId: null,
    checklist: CHECK('publish', ['Title', 'Description', 'Tags', 'Schedule it'], 3), stageDates: { publish: TODAY }, assets: [], streamStart: null, streamMinutes: null, views24h: null, views7d: null, postNotes: '',
    createdAt: stamp(addDays(TODAY, -12)), updatedAt: stamp(TODAY), checklistDone: 3, checklistTotal: 4
  },
  {
    id: 706, title: 'Logbook explainer', type: 'video', platform: 'YouTube', hook: 'One line a day is enough.', stage: 'published', position: 1, series: 'Systems', tags: ['systems'], targetPublishDate: addDays(TODAY, -4), publishedDate: addDays(TODAY, -4), publishedUrl: 'https://example.com/logbook', scriptNoteId: 603,
    checklist: [...CHECK('publish', ['Title', 'Description', 'Tags', 'Schedule it'], 4), ...CHECK('published', ['Record views at 24 hours', 'Record views at 7 days', 'Note what to do differently'], 1)], stageDates: { published: addDays(TODAY, -4) }, assets: [], streamStart: null, streamMinutes: null, views24h: 1240, views7d: null, postNotes: 'Hook was too slow.',
    createdAt: stamp(addDays(TODAY, -30)), updatedAt: stamp(addDays(TODAY, -3)), checklistDone: 1, checklistTotal: 3, scriptNoteTitle: 'Weekly template'
  },
  {
    id: 707, title: 'Overdue idea: mailbag #4', type: 'short', platform: 'Instagram', hook: '', stage: 'idea', position: 2, series: 'Mailbag', tags: [], targetPublishDate: addDays(TODAY, -2), publishedDate: null, publishedUrl: null, scriptNoteId: null,
    checklist: [], stageDates: {}, assets: [], streamStart: null, streamMinutes: null, views24h: null, views7d: null, postNotes: '',
    createdAt: stamp(addDays(TODAY, -20)), updatedAt: stamp(addDays(TODAY, -20)), checklistDone: 0, checklistTotal: 0
  }
]

// ---------- expenses (integer cents) ----------

export const expenseCategories: ExpenseCategory[] = [
  { id: 801, name: 'Food & Dining', colour: '#f97316', icon: 'utensils', archived: false, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), deletedAt: null, deleteBatchId: null },
  { id: 802, name: 'Transport', colour: '#0ea5e9', icon: 'car', archived: false, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), deletedAt: null, deleteBatchId: null },
  { id: 803, name: 'Housing', colour: '#64748b', icon: 'home', archived: false, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), deletedAt: null, deleteBatchId: null },
  { id: 804, name: 'Bills & Utilities', colour: '#8b5cf6', icon: 'zap', archived: false, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), deletedAt: null, deleteBatchId: null },
  { id: 805, name: 'Health & Medical', colour: '#10b981', icon: 'heart', archived: false, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), deletedAt: null, deleteBatchId: null },
  { id: 806, name: 'Fun & Entertainment', colour: '#f43f5e', icon: 'sparkles', archived: false, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), deletedAt: null, deleteBatchId: null },
  { id: 807, name: 'Shopping', colour: '#f59e0b', icon: 'bag', archived: false, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), deletedAt: null, deleteBatchId: null },
  { id: 808, name: 'Other', colour: '#6b7280', icon: 'more', archived: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), deletedAt: null, deleteBatchId: null }
]

const TX_EXPENSE_SEEDS: { offset: number; cat: number; payee: string; amount: number; type: ExpenseTransaction['type']; note: string }[] = [
  { offset: -1, cat: 801, payee: 'Corner cafe', amount: 1240, type: 'expense', note: 'Coffee and a roll' },
  { offset: -1, cat: 802, payee: 'Metro card', amount: 2200, type: 'expense', note: '' },
  { offset: -2, cat: 801, payee: 'Green market', amount: 4830, type: 'expense', note: 'Weekly shop' },
  { offset: -2, cat: 806, payee: 'Cinema', amount: 1800, type: 'expense', note: 'Two tickets' },
  { offset: -3, cat: 803, payee: 'Landlord', amount: 95000, type: 'expense', note: 'November rent' },
  { offset: -3, cat: 804, payee: 'Electricity', amount: 8420, type: 'expense', note: 'October bill' },
  { offset: -4, cat: 801, payee: 'Bakery', amount: 650, type: 'expense', note: '' },
  { offset: -5, cat: 807, payee: 'Book shop', amount: 3200, type: 'expense', note: 'Two paperbacks' },
  { offset: -6, cat: 802, payee: 'Fuel', amount: 6100, type: 'expense', note: '' },
  { offset: -7, cat: 805, payee: 'Pharmacy', amount: 1450, type: 'expense', note: '' },
  { offset: -8, cat: 806, payee: 'Record shop', amount: 2799, type: 'expense', note: '' },
  { offset: -9, cat: 1, payee: 'Employer', amount: 320000, type: 'income', note: 'October salary' },
  { offset: -9, cat: 801, payee: 'Takeaway', amount: 2350, type: 'expense', note: 'Late night' },
  { offset: -10, cat: 802, payee: 'Taxi', amount: 1890, type: 'expense', note: '' },
  { offset: -11, cat: 807, payee: 'Hardware', amount: 12500, type: 'expense', note: 'Shelf and drill bits' },
  { offset: -14, cat: 801, payee: 'Green market', amount: 5120, type: 'expense', note: 'Weekly shop' },
  { offset: -16, cat: 803, payee: 'Savings goal: Japan trip', amount: 30000, type: 'transfer', note: 'Monthly transfer' },
  { offset: -18, cat: 806, payee: 'Streaming', amount: 1299, type: 'expense', note: '' },
  { offset: -22, cat: 805, payee: 'Dentist', amount: 8000, type: 'expense', note: 'Check-up' },
  { offset: -26, cat: 801, payee: 'Green market', amount: 4690, type: 'expense', note: 'Weekly shop' },
  // Previous month, so the month picker has history too
  { offset: -33, cat: 803, payee: 'Landlord', amount: 95000, type: 'expense', note: 'October rent' },
  { offset: -34, cat: 801, payee: 'Green market', amount: 5020, type: 'expense', note: '' },
  { offset: -36, cat: 804, payee: 'Internet', amount: 3999, type: 'expense', note: '' }
]

export const expenseTx: ExpenseTransaction[] = TX_EXPENSE_SEEDS.map((t, i) => {
  const date = addDays(TODAY, t.offset)
  return {
    id: 900 + i, amount: t.amount, currency: 'USD', date, categoryId: t.cat === 1 ? null : t.cat, payee: t.payee,
    note: t.note, type: t.type, tags: [], transferTarget: t.type === 'transfer' ? 'goal:2' : null, recurringId: null,
    createdAt: stamp(date), updatedAt: stamp(date), deletedAt: null, deleteBatchId: null
  }
})

export const expenseBudgets: ExpenseBudget[] = [
  { cat: 801, amount: 40000 }, { cat: 802, amount: 15000 }, { cat: 803, amount: 100000 },
  { cat: 804, amount: 20000 }, { cat: 805, amount: 10000 }, { cat: 806, amount: 12000 }, { cat: 807, amount: 20000 }
].map((b, i) => ({
  id: 850 + i, categoryId: b.cat, month: TODAY.slice(0, 7), amount: b.amount, currency: 'USD',
  createdAt: stamp(addDays(TODAY, -40)), updatedAt: stamp(addDays(TODAY, -40)), deletedAt: null, deleteBatchId: null
}))

export const recurringBills: RecurringBill[] = [
  { id: 880, name: 'Rent', amount: 95000, currency: 'USD', cadence: 'monthly', intervalDays: null, nextDueDate: `${addDays(TODAY.slice(0, 7) + '-01', 31).slice(0, 7)}-01`, categoryId: 803, reminderLeadDays: 3, autopay: false, trialEndDate: null, payee: 'Landlord', note: '', archived: false, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(TODAY), deletedAt: null, deleteBatchId: null },
  { id: 881, name: 'Electricity', amount: 8420, currency: 'USD', cadence: 'monthly', intervalDays: null, nextDueDate: addDays(TODAY, 6), categoryId: 804, reminderLeadDays: 2, autopay: true, trialEndDate: null, payee: 'Power Co', note: 'Varies with the season.', archived: false, createdAt: stamp(addDays(TODAY, -180)), updatedAt: stamp(TODAY), deletedAt: null, deleteBatchId: null },
  { id: 882, name: 'Internet', amount: 3999, currency: 'USD', cadence: 'monthly', intervalDays: null, nextDueDate: addDays(TODAY, 2), categoryId: 804, reminderLeadDays: 3, autopay: true, trialEndDate: null, payee: 'Fibre Co', note: '', archived: false, createdAt: stamp(addDays(TODAY, -180)), updatedAt: stamp(TODAY), deletedAt: null, deleteBatchId: null },
  { id: 883, name: 'Streaming bundle', amount: 1299, currency: 'USD', cadence: 'monthly', intervalDays: null, nextDueDate: addDays(TODAY, 12), categoryId: 806, reminderLeadDays: 1, autopay: true, trialEndDate: addDays(TODAY, 20), payee: 'Stream Co', note: 'Trial ends soon.', archived: false, createdAt: stamp(addDays(TODAY, -20)), updatedAt: stamp(TODAY), deletedAt: null, deleteBatchId: null },
  { id: 884, name: 'Gym', amount: 4500, currency: 'USD', cadence: 'monthly', intervalDays: null, nextDueDate: addDays(TODAY, -4), categoryId: 805, reminderLeadDays: 2, autopay: false, trialEndDate: null, payee: 'Gym', note: 'Overdue, pay by hand.', archived: false, createdAt: stamp(addDays(TODAY, -150)), updatedAt: stamp(TODAY), deletedAt: null, deleteBatchId: null }
]



// ---------- focus ----------

export const projects: Project[] = [
  { id: 1001, name: 'Site', colour: '#8b5cf6', archived: false, createdAt: stamp(addDays(TODAY, -120)), updatedAt: stamp(addDays(TODAY, -120)), deletedAt: null, deleteBatchId: null },
  { id: 1002, name: 'Channel', colour: '#f43f5e', archived: false, createdAt: stamp(addDays(TODAY, -120)), updatedAt: stamp(addDays(TODAY, -120)), deletedAt: null, deleteBatchId: null },
  { id: 1003, name: 'Journal', colour: '#10b981', archived: false, createdAt: stamp(addDays(TODAY, -120)), updatedAt: stamp(addDays(TODAY, -120)), deletedAt: null, deleteBatchId: null },
  { id: 1004, name: 'Admin', colour: '#64748b', archived: false, createdAt: stamp(addDays(TODAY, -120)), updatedAt: stamp(addDays(TODAY, -120)), deletedAt: null, deleteBatchId: null },
  { id: 1005, name: 'Old project', colour: '#f59e0b', archived: true, createdAt: stamp(addDays(TODAY, -300)), updatedAt: stamp(addDays(TODAY, -90)), deletedAt: null, deleteBatchId: null }
]

const SESSION_SEEDS: { offset: number; start: string; minutes: number; project: number; task: number | null; type: TimeSession['type']; note: string }[] = [
  { offset: 0, start: '09:00', minutes: 25, project: 1, task: 505, type: 'focus', note: 'Calculator docs, section 1' },
  { offset: 0, start: '09:30', minutes: 25, project: 1, task: 505, type: 'focus', note: 'Section 2' },
  { offset: 0, start: '10:00', minutes: 5, project: 1, task: null, type: 'short-break', note: '' },
  { offset: -1, start: '14:00', minutes: 50, project: 2, task: 512, type: 'count-up', note: 'Edit pass' },
  { offset: -1, start: '09:00', minutes: 25, project: 3, task: null, type: 'focus', note: 'Morning pages' },
  { offset: -2, start: '10:00', minutes: 25, project: 1, task: null, type: 'focus', note: 'Spec notes' },
  { offset: -2, start: '16:00', minutes: 15, project: 1, task: null, type: 'long-break', note: '' },
  { offset: -3, start: '08:30', minutes: 75, project: 2, task: null, type: 'count-up', note: 'Script draft' },
  { offset: -4, start: '09:15', minutes: 25, project: 3, task: null, type: 'focus', note: '' },
  { offset: -5, start: '13:00', minutes: 50, project: 4, task: null, type: 'focus', note: 'Receipts' },
  { offset: -6, start: '10:30', minutes: 100, project: 1, task: null, type: 'count-up', note: 'Deep build' }
]

export const focusSessions: TimeSession[] = SESSION_SEEDS.map((s, i) => {
  const date = addDays(TODAY, s.offset)
  const startAt = `${date}T${s.start}:00.000Z`
  const endAt = new Date(Date.parse(startAt) + s.minutes * 60_000).toISOString()
  return {
    id: 1100 + i, taskId: s.task, projectId: s.project, projectName: projects.find((p) => p.id === s.project)?.name ?? '',
    startedAt: startAt, endedAt: endAt, plannedSeconds: s.type === 'count-up' ? 0 : s.minutes * 60,
    actualSeconds: s.minutes * 60, type: s.type, completed: s.type === 'focus', note: s.note, source: i % 3 === 0 ? 'manual' : 'timer',
    createdAt: startAt, updatedAt: endAt, deletedAt: null, deleteBatchId: null
  }
})

// ---------- tools: snippets and scratchpads ----------

export const snippets: Snippet[] = [
  { id: 1201, title: 'SQLite backup', body: 'sqlite3 ~/AppData/Roaming/feeblest/data.db ".backup backup.db"', tags: ['sqlite', 'ops'], createdAt: stamp(addDays(TODAY, -20)), updatedAt: stamp(addDays(TODAY, -2)) },
  { id: 1202, title: 'Meeting opener', body: "Thanks everyone for joining. Three things on the agenda today, and I want us out in 25 minutes.", tags: ['work'], createdAt: stamp(addDays(TODAY, -40)), updatedAt: stamp(addDays(TODAY, -15)) },
  { id: 1203, title: 'Home address', body: '14 Example Street\nSampletown\n4820', tags: [], createdAt: stamp(addDays(TODAY, -90)), updatedAt: stamp(addDays(TODAY, -90)) },
  { id: 1204, title: 'Git: undo last commit', body: 'git reset --soft HEAD~1', tags: ['git'], createdAt: stamp(addDays(TODAY, -60)), updatedAt: stamp(addDays(TODAY, -30)) }
]

export const scratchpads: Scratchpad[] = [
  { id: 1301, name: 'Scratch', content: 'Ideas for the savings video:\n- start with the boring account\n- one number that surprised me\n- end on the rule, not the tool\n', position: 0, createdAt: stamp(addDays(TODAY, -20)), updatedAt: stamp(TODAY) },
  { id: 1302, name: 'Shopping', content: 'Coffee\nOlive oil\nNote paper\nNew cable', position: 1, createdAt: stamp(addDays(TODAY, -30)), updatedAt: stamp(addDays(TODAY, -1)) }
]

// ---------- templates (the built-in set, as main seeds it) ----------

export const templates: Template[] = [
  { id: 1401, kind: 'note', name: 'Meeting note', isBuiltin: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), payload: { title: 'Meeting with {{weekday}} {{date}}', body: '## Attendees\n\n- \n\n## Agenda\n\n- [ ] \n\n## Notes\n\n\n## Decisions\n\n\n## Actions\n\n- [ ] ' } },
  { id: 1402, kind: 'note', name: 'Blank checklist', isBuiltin: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), payload: { title: '', body: '- [ ] ' } },
  { id: 1403, kind: 'logbook', name: 'Morning pages', isBuiltin: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), payload: { title: '{{weekday}} {{date}}', body: '## How I woke up\n\n\n## One thing for today\n\n\n## Gratitude\n\n- ', mood: 'okay', tags: [] } },
  { id: 1404, kind: 'logbook', name: 'Evening review', isBuiltin: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), payload: { title: 'Evening review, {{date}}', body: '## What went well\n\n- \n\n## What I would do differently\n\n- \n\n## Tomorrow\n\n- ', tags: ['review'] } },
  { id: 1405, kind: 'task', name: 'Deep work block', isBuiltin: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), payload: { title: 'Deep work: {{weekday}}', notes: 'One clear outcome. Phone away, timer on.', priority: 'high', tags: ['focus'], subtasks: ['Turn on Focus for 25 minutes', 'Write down the one outcome', 'Close everything else'], recurrenceRule: { frequency: 'daily', intervalDays: 1 } } },
  { id: 1406, kind: 'task', name: 'Weekly review', isBuiltin: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), payload: { title: 'Weekly review, week of {{date}}', priority: 'medium', tags: ['review', 'weekly'], subtasks: ['Close open tasks that no longer matter', 'Check savings and trades', 'Plan next week'], recurrenceRule: { frequency: 'weekly', intervalDays: 7 } } },
  { id: 1407, kind: 'content', name: 'Video: full checklist', isBuiltin: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), payload: { checklists: { idea: ['Capture the idea in one sentence', 'Note who it is for and why it matters'], script: ['Hook in the first two lines', 'One outcome the viewer can use'], record: ['Audio check', 'Lighting check', 'Backup the raw files'], edit: ['Cut the dead air', 'Captions', 'Thumbnail'], publish: ['Title', 'Description', 'Tags', 'Schedule'] } } },
  { id: 1408, kind: 'trade', name: 'Pre-trade and post-trade', isBuiltin: true, createdAt: stamp(addDays(TODAY, -200)), updatedAt: stamp(addDays(TODAY, -200)), payload: { preTrade: ['Setup matches my plan', 'Risk on this trade is written down', 'No trade out of boredom or revenge', 'Screenshot of the setup taken'], postTrade: ['Followed the plan, whichever way it went', 'Stop and target respected', 'One line on what I learned', 'Journal entry written'] } }
]

// ---------- trash ----------

export const trashBatches: TrashBatch[] = [
  { batchId: 'a1', trashedAt: stamp(addDays(TODAY, -2), '11:04'), count: 2, items: [{ type: 'task', id: 550, label: 'Old task from the board' }, { type: 'note', id: 199, label: 'Scratch note' }] },
  { batchId: 'a2', trashedAt: stamp(addDays(TODAY, -9), '17:41'), count: 1, items: [{ type: 'trade', id: 299, label: 'XAUUSD, short' }] }
]

// ---------- automation activity ----------

export const automationActivity = [
  { id: 1501, at: stamp(addDays(TODAY, -1), '21:12'), rule: 'loss-reflection', label: 'Created a reflection draft for the EURUSD loss', event: 'trade-closed', eventKey: 'trade:203', entryId: 109 },
  { id: 1502, at: stamp(addDays(TODAY, -4), '16:05'), rule: 'goal-celebration', label: 'New desk chair reached its target', event: 'goal-reached', eventKey: 'goal:402', entryId: null }
]

// ---------- derived helpers used by the fake API ----------

export function habitWithStats(seed: HabitSeed, index: number, today: string): Habit {
  const completions = habitCompletionsFor(seed, index)
  const checkins = completions.filter((c) => c.status === 'done').map((c) => c.date)
  const done = checkins.length
  return {
    id: 1600 + index, name: seed.name, notes: '', days: seed.days, archived: index === HABIT_SEEDS.length - 1,
    startDate: HABIT_START, checkins, completions,
    type: seed.type, target: seed.target, unit: seed.unit, timeOfDay: seed.timeOfDay, sortOrder: index,
    reminderTime: seed.reminder, autoCompleteOn: '',
    // Simple, believable stats: the exact rule lives in shared/habits.ts; the
    // pages only display these numbers.
    stats: { current: Math.min(done, 6 + index * 3), best: Math.min(done, 14 + index * 4), rate30: Math.round(seed.rate * 100), total: done },
    createdAt: HABIT_START, updatedAt: stamp(today)
  }
}

export function habitList(today: string = TODAY): Habit[] {
  return HABIT_SEEDS.map((seed, i) => habitWithStats(seed, i, today))
}

/** The mood word nearest to a 1–5 average (same rule the briefing uses). */
export function moodNear(score: number): LogEntry['mood'] {
  let best: LogEntry['mood'] = 'okay'
  let bestGap = Infinity
  for (const [mood, value] of Object.entries(MOOD_SCORE)) {
    const gap = Math.abs(value - score)
    if (gap < bestGap) { best = mood as LogEntry['mood']; bestGap = gap }
  }
  return best
}

export const allSavingsTx = savingsTx
