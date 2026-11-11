// Trades > Analysis. Every number comes from the pure rules in
// shared/tradeAnalysis.ts. This page loads its OWN trade list from its OWN
// date range: the search, direction, tag and range on the Trades tab never
// reach this query.
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, LineChart } from 'lucide-react'
import type { Trade } from '../../../shared/types'
import {
  analyzeTrades, analysisDateFilter, MIN_GROUP_TRADES, SMALL_SAMPLE_TRADES,
  type BreakdownName, type BreakdownRow, type TradeHighlight
} from '../../../shared/tradeAnalysis'
import { formatDate, today } from '../lib/dates'
import { fmtAmount, fmtPnl, pnlColor } from '../lib/format'
import { EmptyState } from '../components/EmptyState'
import { EquityCurve } from '../components/EquityCurve'
import { HelpButton } from '../components/PageHeader'
import { Segmented } from '../components/Segmented'
import { useRefreshOnCapture } from '../lib/dataChanged'
import type { DateRangeValue } from '../components/DateRangePopover'

const BREAKDOWNS: { id: BreakdownName; label: string }[] = [
  { id: 'asset', label: 'Asset' },
  { id: 'direction', label: 'Direction' },
  { id: 'tag', label: 'Tag' },
  { id: 'weekday', label: 'Weekday' },
  { id: 'month', label: 'Month' }
]

const BREAKDOWN_NOTE: Record<BreakdownName, string> = {
  asset: 'Assets are grouped ignoring case and surrounding spaces. Each row shows the spelling used most often.',
  direction: 'The side taken on entry. Long and short each count every closed trade once.',
  tag: 'A trade counts in every tag it has, so these rows can add up to more than the summary. Trades with no tags are not listed.',
  weekday: 'By entry date, Monday to Sunday. Open trades are never included.',
  month: 'By entry month. Open trades are never included.'
}

type SortKey = 'label' | 'closed' | 'winRate' | 'totalPnl' | 'avgPnl' | 'profitFactor'
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'label', label: 'Group' },
  { key: 'closed', label: 'Closed', numeric: true },
  { key: 'winRate', label: 'Win rate', numeric: true },
  { key: 'totalPnl', label: 'Net P&L', numeric: true },
  { key: 'avgPnl', label: 'Avg P&L', numeric: true },
  { key: 'profitFactor', label: 'Profit factor', numeric: true }
]

function valueOf(row: BreakdownRow, key: SortKey): string | number | null {
  if (key === 'label') return row.label
  return row[key]
}

function BreakdownTable({ rows, name }: { rows: BreakdownRow[]; name: BreakdownName }) {
  // The engine returns net P&L, highest first. Clicking a header changes only
  // the order on screen; no row is ever called the best or the worst group.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'totalPnl', dir: 'desc' })

  const sorted = useMemo(() => {
    const dir = sort.dir
    return [...rows].sort((a, b) => {
      const av = valueOf(a, sort.key)
      const bv = valueOf(b, sort.key)
      // Blank values (a group with no losses has no profit factor) stay last in
      // both directions, so turning the order round never hides a real row.
      if (av === null || bv === null) {
        if (av === null && bv === null) return a.label.localeCompare(b.label)
        return av === null ? 1 : -1
      }
      const base = typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : Number(av) - Number(bv)
      if (base !== 0) return dir === 'asc' ? base : -base
      return a.label.localeCompare(b.label)
    })
  }, [rows, sort])

  const toggle = (key: SortKey): void => {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'label' ? 'asc' : 'desc' })
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted">No closed trades in this range.</p>
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <caption className="sr-only">{BREAKDOWNS.find((b) => b.id === name)?.label} breakdown</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key
              const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th key={column.key} scope="col" className={column.numeric ? 'r' : ''}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-fg"
                    onClick={() => toggle(column.key)}>
                    {column.label}
                    <Icon size={12} aria-hidden="true" />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.key}>
              <td>
                <span className="font-medium">{row.label}</span>
                {row.fewTrades && (
                  <span className="badge badge-muted ml-2" title={`Fewer than ${MIN_GROUP_TRADES} closed trades`}>
                    Few trades
                  </span>
                )}
              </td>
              <td className="r">{row.closed}</td>
              <td className="r">{row.winRate.toFixed(0)}%</td>
              <td className={`r font-medium ${pnlColor(row.totalPnl)}`}>{fmtPnl(row.totalPnl)}</td>
              <td className={`r ${pnlColor(row.avgPnl)}`}>{fmtPnl(row.avgPnl)}</td>
              <td className="r">{row.profitFactor === null ? '-' : row.profitFactor.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function summaryCard(label: string, value: string, sub: string, color = ''): ReactElement {
  return (
    <div className="card card-pad-sm">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

function TradeList({ trades, empty }: { trades: TradeHighlight[]; empty: string }) {
  if (trades.length === 0) return <p className="mt-2 text-sm text-muted">{empty}</p>
  return (
    <ul className="mt-2 space-y-2">
      {trades.map((trade) => (
        <li key={trade.tradeId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0">
            <span className="font-medium">{trade.asset}</span>
            <span className="ml-2 text-xs text-muted">{formatDate(trade.date)} · {trade.direction === 'long' ? 'Long' : 'Short'}</span>
          </span>
          <span className={`font-semibold tabular-nums ${pnlColor(trade.pnl)}`}>{fmtPnl(trade.pnl)}</span>
        </li>
      ))}
    </ul>
  )
}

export function TradesAnalysis({ range, onRangeChange }: {
  range: DateRangeValue
  onRangeChange: (next: DateRangeValue) => void
}) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [breakdown, setBreakdown] = useState<BreakdownName>('asset')

  // analysisDateFilter returns from/to and nothing else, by construction.
  const filter = useMemo(() => analysisDateFilter(range, today()), [range])

  const refresh = useCallback(async () => {
    try {
      const rows = await window.api.trades.list(filter)
      setTrades(rows)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoaded(true)
    }
  }, [filter])

  useEffect(() => {
    setLoaded(false)
    void refresh()
  }, [refresh])
  useRefreshOnCapture(refresh)

  const analysis = useMemo(() => analyzeTrades(trades), [trades])
  const directions = useMemo(() => new Map(trades.map((trade) => [trade.id, trade.direction])), [trades])
  const summary = analysis.summary

  if (!loaded) return <p className="text-sm text-muted" role="status">Loading analysis…</p>
  if (error) return <p className="text-sm text-neg" role="alert">Could not load trades for analysis.</p>

  if (summary.closed < MIN_GROUP_TRADES) {
    return (
      <div className="card card-pad">
        <EmptyState icon={LineChart} title="Not enough closed trades yet"
          text={`Analysis needs at least ${MIN_GROUP_TRADES} closed trades in this range. You have ${summary.closed}. Open trades do not count.`}
          action={range.preset !== 'all'
            ? <button type="button" className="btn mt-4" onClick={() => onRangeChange({ preset: 'all' })}>Show all time</button>
            : undefined} />
      </div>
    )
  }

  const drawdown = analysis.drawdown
  const drawdownSummary = drawdown.amount > 0
    ? `Largest fall ${fmtAmount(drawdown.amount)} from ${drawdown.peakDate ? `the peak of ${fmtPnl(drawdown.peakValue)} on ${formatDate(drawdown.peakDate)}` : 'the start at 0.00'} to ${fmtPnl(drawdown.troughValue)} on ${drawdown.troughDate ? formatDate(drawdown.troughDate) : 'the same point'}. ${drawdown.recoveryDate ? `Recovered on ${formatDate(drawdown.recoveryDate)}.` : 'Not recovered yet.'}`
    : 'No drawdown in this range: the running total never fell below a peak.'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 stat-tiles-sm">
        {summaryCard('Net P&L', fmtPnl(summary.totalPnl), 'after fees', pnlColor(summary.totalPnl))}
        {summaryCard('Win rate', summary.winRate === null ? '-' : `${summary.winRate.toFixed(0)}%`,
          `${summary.wins}W · ${summary.losses}L · ${summary.breakeven} flat`)}
        {summaryCard('Expectancy', summary.expectancy === null ? '-' : fmtPnl(summary.expectancy),
          'per closed trade, net of fees', pnlColor(summary.expectancy))}
        {summaryCard('Profit factor', summary.profitFactor === null ? '-' : summary.profitFactor.toFixed(2),
          summary.profitFactor === null && summary.wins > 0 && summary.losses === 0 ? 'no losses yet' : 'gross wins ÷ losses')}
        {summaryCard('Payoff ratio', summary.payoff === null ? '-' : summary.payoff.toFixed(2),
          'avg win ÷ avg loss')}
        {summaryCard('Closed trades', String(summary.closed), `${summary.open} open`)}
      </div>

      {summary.closed < SMALL_SAMPLE_TRADES && (
        <p className="text-sm text-muted">Based on {summary.closed} closed trades, so small samples move a lot.</p>
      )}

      <section className="card card-pad-sm" aria-labelledby="equity-curve-title">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1 basis-72">
            <h2 className="card-head-title" id="equity-curve-title">Equity curve</h2>
            <p className="mt-1 text-sm text-muted">{drawdownSummary}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1">
              <span className="stat-label">Max drawdown</span>
              <HelpButton label="About max drawdown">
                Max drawdown is the largest fall from a high point in the running total to a later low.
                It is shown as an amount only: the app does not know your account size, so a percentage would be misleading.
              </HelpButton>
            </div>
            <div className="stat-value">{fmtAmount(drawdown.amount)}</div>
            <div className="stat-sub">amount, not a percentage</div>
          </div>
        </div>
        <div className="mt-3">
          <EquityCurve points={analysis.series} drawdown={drawdown} directions={directions} />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="card card-pad-sm" aria-labelledby="best-trade-title">
          <h2 className="card-head-title" id="best-trade-title">Best trade</h2>
          <TradeList trades={analysis.best} empty="No winning trade in this range." />
        </section>
        <section className="card card-pad-sm" aria-labelledby="worst-trade-title">
          <h2 className="card-head-title" id="worst-trade-title">Worst trade</h2>
          <TradeList trades={analysis.worst} empty="No losing trade in this range." />
        </section>
        <section className="card card-pad-sm" aria-labelledby="streaks-title">
          <h2 className="card-head-title" id="streaks-title">Streaks</h2>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="stat-label">Longest win</dt>
              <dd className="stat-value">{analysis.streaks.longestWin}</dd>
            </div>
            <div>
              <dt className="stat-label">Longest loss</dt>
              <dd className="stat-value">{analysis.streaks.longestLoss}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">A breakeven trade ends both streaks.</p>
        </section>
      </div>

      <section className="space-y-3" aria-labelledby="breakdown-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-head-title" id="breakdown-title">Breakdown</h2>
          <Segmented label="Breakdown table" value={breakdown} options={BREAKDOWNS} onChange={setBreakdown} size="sm" />
        </div>
        <div className="card overflow-hidden">
          <p className="border-b border-line px-4 py-2 text-xs text-muted">{BREAKDOWN_NOTE[breakdown]}</p>
          <BreakdownTable rows={analysis.breakdowns[breakdown]} name={breakdown} />
        </div>
      </section>
    </div>
  )
}
