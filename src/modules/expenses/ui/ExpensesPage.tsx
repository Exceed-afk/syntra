// Expenses page (Phase 1): one page with four tabs — Overview, Transactions,
// Budgets and Recurring. This file owns the tab bar and the shared month.
//
// It is a module page like every other: it receives ModuleProps and renders
// inside the app shell. Tab switching is keyboard accessible (roving arrow keys
// on the tab strip, Home/End jump to the ends).
import { useEffect, useState } from 'react'
import type { ModuleProps } from '../../../renderer/src/lib/navigation'
import { PageHeader } from '../../../renderer/src/components/PageHeader'
import { Toolbar, ToolbarEnd, ToolbarStart } from '../../../renderer/src/components/Toolbar'
import { Segmented } from '../../../renderer/src/components/Segmented'
import { today } from '../../../renderer/src/lib/dates'
import { OverviewTab } from './OverviewTab'
import { TransactionsTab } from './TransactionsTab'
import { BudgetsTab } from './BudgetsTab'
import { RecurringTab } from './RecurringTab'
import { MonthPicker } from './components'
import { todayMonth } from './format'

export type ExpensesTab = 'overview' | 'transactions' | 'budgets' | 'recurring'

const TABS: { id: ExpensesTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'recurring', label: 'Recurring' }
]

export function ExpensesPage(_props: ModuleProps) {
  const [tab, setTab] = useState<ExpensesTab>('overview')
  const [month, setMonth] = useState(todayMonth(today()))

  // Keep the page reachable from the command palette / global keys: Ctrl+1..4
  // inside the page switches tabs, leaving the app's global shortcuts alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey && !e.metaKey && e.ctrlKey && /^[1-4]$/.test(e.key)) {
        const index = Number(e.key) - 1
        if (TABS[index]) {
          e.preventDefault()
          setTab(TABS[index].id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="page">
      <PageHeader
        title="Expenses"
        help="Where your money goes, and how much you can still spend this month. All amounts are kept in whole cents."
      />

      {/* One toolbar row: the four tabs on the left, the month stepper on the
          right. Every tab owns the same month, so the stepper travels with it. */}
      <Toolbar label="Expenses tools">
        <ToolbarStart>
          <Segmented
            label="Expenses views"
            kind="tabs"
            value={tab}
            options={TABS}
            onChange={(next) => setTab(next)}
          />
        </ToolbarStart>
        <ToolbarEnd>
          <MonthPicker month={month} onChange={setMonth} nextDisabled={month >= today().slice(0, 7)} />
        </ToolbarEnd>
      </Toolbar>

      <div role="tabpanel" id={`expenses-panel-${tab}`} aria-labelledby={`expenses-tab-${tab}`} tabIndex={-1}>
        {tab === 'overview' && (
          <OverviewTab month={month} onMonthChange={setMonth} onOpenTransactions={() => setTab('transactions')} />
        )}
        {tab === 'transactions' && <TransactionsTab month={month} onMonthChange={setMonth} />}
        {tab === 'budgets' && <BudgetsTab month={month} onMonthChange={setMonth} />}
        {tab === 'recurring' && <RecurringTab month={month} />}
      </div>
    </div>
  )
}
