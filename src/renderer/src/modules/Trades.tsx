import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRefreshOnCapture } from '../lib/dataChanged'
import { CandlestickChart, Plus } from 'lucide-react'
import type { Direction, Trade, TradeFilter, TradeMeta } from '../../../shared/types'
import { computeStats } from '../../../shared/trades'
import { formatDate, today } from '../lib/dates'
import { fmtNum, fmtPnl, pnlColor } from '../lib/format'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { Pnl } from '../components/Pnl'
import { Toolbar, ToolbarStart, ToolbarEnd, ToolbarSearch } from '../components/Toolbar'
import { FilterPopover, FilterChips, type ActiveFilterChip } from '../components/FilterPopover'
import { DateRangePopover, dateRangeChipOf, type DateRangeValue } from '../components/DateRangePopover'
import { Segmented } from '../components/Segmented'
import type { ModuleProps } from '../lib/navigation'
import { TradeEditor } from './TradeEditor'
import { TradesAnalysis } from './TradesAnalysis'
import { TagChip } from '../components/TagChip'

export function Trades({ target, onTargetHandled }: ModuleProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [meta, setMeta] = useState<TradeMeta>({ assets: [], tags: [] })
  const [filter, setFilter] = useState<TradeFilter>({})
  const [range, setRange] = useState<DateRangeValue>({ preset: 'all' })
  // The Analysis tab has its own range and never reads the filter or range above.
  const [tab, setTab] = useState<'trades' | 'analysis'>('trades')
  const [analysisRange, setAnalysisRange] = useState<DateRangeValue>({ preset: 'all' })
  const [editing, setEditing] = useState<Trade | 'new' | null>(null)
  const [loaded, setLoaded] = useState(false)

  // The date range presets feed the from/to the query already understands; the
  // filter itself never changes shape, so saved settings and the API are safe.
  const rangeDates: Pick<TradeFilter, 'from' | 'to'> = useMemo(() => {
    const t = today()
    const [y, m, d] = t.split('-').map(Number)
    if (range.preset === 'this-month') return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10) }
    if (range.preset === 'last-30') return { from: new Date(Date.UTC(y, m - 1, d - 29)).toISOString().slice(0, 10) }
    if (range.preset === 'this-year') return { from: `${y}-01-01` }
    if (range.preset === 'custom') return { from: range.from, to: range.to }
    return {}
  }, [range])
  const effectiveFilter: TradeFilter = useMemo(() => ({ ...filter, ...rangeDates }), [filter, rangeDates])

  const hasFilter = Boolean(filter.text || filter.tag || filter.direction || range.preset !== 'all')
  const setF = (patch: Partial<TradeFilter>) => setFilter({ ...filter, ...patch })

  // Everything that narrows the list, as removable chips under the toolbar.
  const rangeChip = dateRangeChipOf(range, setRange)
  const activeFilters: ActiveFilterChip[] = [
    ...(filter.text ? [{ id: 'text', label: `Search: ${filter.text}`, onRemove: () => setF({ text: undefined }) }] : []),
    ...(filter.direction ? [{ id: 'direction', label: `Direction: ${filter.direction}`, onRemove: () => setF({ direction: undefined }) }] : []),
    ...(filter.tag ? [{ id: 'tag', label: `Tag: #${filter.tag}`, onRemove: () => setF({ tag: undefined }) }] : []),
    ...(rangeChip ? [{ id: 'range', label: rangeChip.label, onRemove: rangeChip.onRemove }] : [])
  ]
  const chips = activeFilters
  const clearAll = () => { setFilter({}); setRange({ preset: 'all' }) }
  // Stats follow the filters, so you can see e.g. your win rate on one asset.
  const stats = useMemo(() => computeStats(trades), [trades])

  const refresh = useCallback(async () => {
    const [t, m] = await Promise.all([window.api.trades.list(effectiveFilter), window.api.trades.meta()])
    setTrades(t); setMeta(m); setLoaded(true)
  }, [effectiveFilter])

  useEffect(() => {
    const id = setTimeout(refresh, 150)
    return () => clearTimeout(id)
  }, [refresh])
  useRefreshOnCapture(refresh) // something was saved from the Quick capture window

  // Opened from Search: show that trade's editor straight away.
  useEffect(() => {
    if (target?.module === 'trades') { setEditing(target.trade); onTargetHandled() }
  }, [target, onTargetHandled])

  // Ctrl+N logs a new trade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); setEditing('new') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const card = (label: string, value: string, sub: string, color = '') => (
    <div className="card card-pad-sm">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )

  return (
    <div className="page page-wide">
      <PageHeader title="Trades" help={tab === 'analysis'
        ? 'Analysis uses only its own date range. Search, direction and tag filters on the Trades tab never change these numbers. P&L is net of fees.'
        : stats.total === 0 ? 'Track every trade, open or closed. P&L is worked out from entry, exit, size and fees.' : `${stats.closed} closed, ${stats.open} open${hasFilter ? ' (filtered)' : ''}. P&L is worked out from entry, exit, size and fees.`}>
        <button className="btn-primary" onClick={() => setEditing('new')} title="Ctrl+N">
          <Plus size={16} /> New trade
        </button>
      </PageHeader>

      {/* Trades and Analysis are two views of the same page. Analysis owns its own range; the
          Trades filters below are neither shown nor read while Analysis is open. */}
      <Toolbar label="Trades sections">
        <ToolbarStart>
          <Segmented label="Trades sections" kind="tabs" value={tab} onChange={setTab}
            options={[{ id: 'trades', label: 'Trades' }, { id: 'analysis', label: 'Analysis' }]} />
        </ToolbarStart>
        {tab === 'analysis' && (
          <ToolbarEnd>
            <DateRangePopover value={analysisRange} onChange={setAnalysisRange} label="Analysis date range" />
          </ToolbarEnd>
        )}
      </Toolbar>

      {tab === 'trades' && (
        <>
      {stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stat-tiles-sm">
          {card('Total P&L', fmtPnl(stats.totalPnl), `after ${fmtNum(stats.totalFees)} in fees`, pnlColor(stats.totalPnl))}
          {card('Win rate', stats.winRate === null ? '-' : `${stats.winRate.toFixed(0)}%`, `${stats.wins} wins, ${stats.losses} losses`)}
          {card('Closed trades', String(stats.closed), `${stats.open} still open`)}
          {card('Profit factor', stats.profitFactor === null ? '-' : stats.profitFactor.toFixed(2),
            stats.avgWin === null && stats.avgLoss === null ? 'Needs a win and a loss'
              : `avg win ${stats.avgWin === null ? '-' : fmtPnl(stats.avgWin)}, avg loss ${stats.avgLoss === null ? '-' : fmtPnl(stats.avgLoss)}`)}
        </div>
      )}

      <Toolbar label="Trades filters">
        <ToolbarStart>
          <ToolbarSearch value={filter.text ?? ''} onChange={(v) => setF({ text: v })}
            placeholder="Search asset or notes" label="Search asset or notes" />
        </ToolbarStart>
        <ToolbarEnd>
          <FilterPopover
            activeCount={activeFilters.length}
            onClearAll={clearAll}
            filters={[
              { id: 'direction', label: 'Direction', value: filter.direction ?? '', allLabel: 'Long + short',
                onChange: (v) => setF({ direction: (v || undefined) as Direction | undefined }),
                options: [{ value: 'long', label: 'Long' }, { value: 'short', label: 'Short' }] },
              { id: 'tag', label: 'Tag', value: filter.tag ?? '', allLabel: 'All tags', onChange: (v) => setF({ tag: v || undefined }),
                options: meta.tags.map((t) => ({ value: t.tag, label: `#${t.tag} (${t.count})` })) }
            ]}
          />
          <DateRangePopover value={range} onChange={setRange} label="Trades date range" />
        </ToolbarEnd>
      </Toolbar>

      {/* 4. Active filters as removable chips under the toolbar. */}
      <FilterChips chips={chips} onClearAll={clearAll} />

      <div className="mt-4">
        {loaded && trades.length === 0 && (hasFilter ? (
          <EmptyState title="No trades match these filters" text="Try a different asset or clear the filters."
            action={<button className="btn mt-4" onClick={() => setFilter({})}>Clear filters</button>} />
        ) : (
          <EmptyState icon={CandlestickChart} title="No trades yet. Your first entry starts the track record."
            text="Log a trade, including the ones still open, and your stats build themselves."
            action={<button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Log your first trade</button>} />
        ))}

        {trades.length > 0 && (
          <div className="card overflow-hidden">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th><th>Asset</th><th>Side</th><th>Status</th>
                    <th className="r">Entry</th><th className="r">Exit</th><th className="r">Size</th><th className="r">Fees</th><th className="r">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id} onClick={() => setEditing(t)} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setEditing(t)}>
                      <td className="secondary whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="font-medium">
                        {t.asset}
                        {t.tags.length > 0 && <span className="ml-2 inline-flex flex-wrap gap-1 align-middle font-normal">{t.tags.map((x) => <TagChip key={x} tag={x} />)}</span>}
                      </td>
                      <td><span className={`badge capitalize ${t.direction === 'long' ? 'badge-pos' : 'badge-neg'}`}>{t.direction}</span></td>
                      <td>{t.exitPrice === null ? <span className="badge badge-open">Open</span> : <span className="badge badge-muted">Closed</span>}</td>
                      <td className="r">{fmtNum(t.entryPrice)}</td>
                      <td className="r">{t.exitPrice === null ? <span className="text-muted">-</span> : fmtNum(t.exitPrice)}</td>
                      <td className="r">{fmtNum(t.quantity)}</td>
                      <td className="r secondary">{fmtNum(t.fees)}</td>
                      <td className="r font-medium"><Pnl value={t.pnl} open="-" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
        </>
      )}

      {tab === 'analysis' && (
        <TradesAnalysis range={analysisRange} onRangeChange={setAnalysisRange} />
      )}

      {editing && (
        <TradeEditor key={editing === 'new' ? 'new' : editing.id}
          trade={editing === 'new' ? null : editing} assets={meta.assets} knownTags={meta.tags.map((t) => t.tag)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }} />
      )}
    </div>
  )
}
