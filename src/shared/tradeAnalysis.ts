// Pure calculations for the Trades > Analysis tab. No React, no database: the
// page fetches the trades and every number on screen comes from here.
//
// The rules match the rest of the app:
// - P&L is calcPnl (already net of fees); a breakeven trade is closed but is
//   neither a win nor a loss.
// - The curve and every ordering use pnlSeries: closed trades by entry date,
//   then id. Open trades never enter a total.
// - "Best" and "worst" trade are named only when a trade really made or lost
//   money. Ties are kept, not silently reduced to one.
// - A group below MIN_GROUP_TRADES closed trades is marked "few trades". No
//   group is ever ranked as the best or worst; the tables are user-sorted.
import { computeStats, pnlSeries, round8 } from './trades'
import type { Direction, PnlPoint, Trade, TradeFilter } from './types'

/** A breakdown row with fewer closed trades than this is marked "few trades". */
export const MIN_GROUP_TRADES = 5

/** Below this many closed trades the summary says the sample is small. */
export const SMALL_SAMPLE_TRADES = 30

export type AnalysisRangePreset = 'this-month' | 'last-30' | 'this-year' | 'all' | 'custom'

/** The shape of DateRangePopover's value; kept here so the shared rule has no UI import. */
export interface AnalysisRange {
  preset: AnalysisRangePreset
  from?: string
  to?: string
}

/**
 * The ONLY trade filter Analysis builds. It returns the date keys and nothing
 * else, so a search, direction or tag set on the Trades tab can never reach
 * this tab's query. Presets use the same date maths as DateRangePopover.
 */
export function analysisDateFilter(range: AnalysisRange, todayIso: string): Pick<TradeFilter, 'from' | 'to'> {
  const [y, m, d] = todayIso.split('-').map(Number)
  if (range.preset === 'this-month') return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10) }
  if (range.preset === 'last-30') return { from: new Date(Date.UTC(y, m - 1, d - 29)).toISOString().slice(0, 10) }
  if (range.preset === 'this-year') return { from: `${y}-01-01` }
  if (range.preset === 'custom') {
    const out: Pick<TradeFilter, 'from' | 'to'> = {}
    if (range.from) out.from = range.from
    if (range.to) out.to = range.to
    return out
  }
  return {}
}

export interface AnalysisSummary {
  total: number
  open: number
  closed: number
  wins: number
  losses: number
  breakeven: number
  winRate: number | null
  totalPnl: number
  avgWin: number | null
  avgLoss: number | null
  /** Total P&L divided by closed trades; breakevens contribute 0. */
  expectancy: number | null
  /** Average win divided by the absolute average loss; null until both exist. */
  payoff: number | null
  profitFactor: number | null
}

export interface DrawdownInfo {
  /** Positive amount of the fall; 0 when the curve never went below a peak. */
  amount: number
  peakValue: number
  /** null means the starting baseline (0 before the first trade). */
  peakDate: string | null
  /** Index into the series, or -1 when the peak is the starting baseline. */
  peakIndex: number
  troughValue: number
  troughDate: string | null
  /** Index into the series, or -1 when there was no drawdown. */
  troughIndex: number
  /** First later trade back at the peak, or null when it has not recovered. */
  recoveryDate: string | null
}

export interface Streaks {
  longestWin: number
  longestLoss: number
}

export interface TradeHighlight {
  tradeId: number
  date: string
  asset: string
  direction: Direction
  pnl: number
}

export type BreakdownName = 'asset' | 'direction' | 'tag' | 'weekday' | 'month'

export interface BreakdownRow {
  key: string
  label: string
  closed: number
  wins: number
  losses: number
  /** 0-100; breakevens count in the denominator. */
  winRate: number
  totalPnl: number
  avgPnl: number
  profitFactor: number | null
  fewTrades: boolean
}

export interface TradeAnalysis {
  summary: AnalysisSummary
  series: PnlPoint[]
  drawdown: DrawdownInfo
  streaks: Streaks
  best: TradeHighlight[]
  worst: TradeHighlight[]
  breakdowns: Record<BreakdownName, BreakdownRow[]>
}

const sum = (values: number[]): number => round8(values.reduce((a, b) => a + b, 0))

function summaryOf(trades: Trade[]): AnalysisSummary {
  const stats = computeStats(trades)
  return {
    total: stats.total,
    open: stats.open,
    closed: stats.closed,
    wins: stats.wins,
    losses: stats.losses,
    breakeven: stats.closed - stats.wins - stats.losses,
    winRate: stats.winRate,
    totalPnl: stats.totalPnl,
    avgWin: stats.avgWin,
    avgLoss: stats.avgLoss,
    expectancy: stats.closed ? round8(stats.totalPnl / stats.closed) : null,
    payoff: stats.avgWin !== null && stats.avgLoss !== null && stats.avgLoss !== 0
      ? round8(stats.avgWin / Math.abs(stats.avgLoss))
      : null,
    profitFactor: stats.profitFactor
  }
}

// The largest fall from a running peak to a later trough. Peaks are measured
// from 0 at the start of the range (there is no account size or earlier
// history here). The first of two equal drawdowns wins, so the result is
// deterministic. Recovery is the first later trade whose running total is back
// at the peak and is only searched forward from the trough.
function drawdownOf(points: PnlPoint[]): DrawdownInfo {
  let peak = 0
  let peakDate: string | null = null
  let peakIndex = -1

  let amount = 0
  let maxPeak = 0
  let maxPeakDate: string | null = null
  let maxPeakIndex = -1
  let maxTrough = 0
  let maxTroughDate: string | null = null
  let maxTroughIndex = -1

  points.forEach((point, index) => {
    if (point.cumulative > peak) {
      peak = point.cumulative
      peakDate = point.date
      peakIndex = index
    }
    const drop = round8(peak - point.cumulative)
    if (drop > amount) {
      amount = drop
      maxPeak = peak
      maxPeakDate = peakDate
      maxPeakIndex = peakIndex
      maxTrough = point.cumulative
      maxTroughDate = point.date
      maxTroughIndex = index
    }
  })

  let recoveryDate: string | null = null
  if (amount > 0) {
    for (let i = maxTroughIndex + 1; i < points.length; i++) {
      if (points[i].cumulative >= maxPeak) {
        recoveryDate = points[i].date
        break
      }
    }
  }

  return {
    amount,
    peakValue: maxPeak,
    peakDate: maxPeakDate,
    peakIndex: maxPeakIndex,
    troughValue: maxTrough,
    troughDate: maxTroughDate,
    troughIndex: maxTroughIndex,
    recoveryDate
  }
}

// A breakeven trade ends both streaks: it is neither a win nor a loss.
function streaksOf(points: PnlPoint[]): Streaks {
  let win = 0
  let loss = 0
  let longestWin = 0
  let longestLoss = 0
  for (const point of points) {
    if (point.pnl > 0) {
      win++
      loss = 0
    } else if (point.pnl < 0) {
      loss++
      win = 0
    } else {
      win = 0
      loss = 0
    }
    if (win > longestWin) longestWin = win
    if (loss > longestLoss) longestLoss = loss
  }
  return { longestWin, longestLoss }
}

// pnlSeries order, with the original rows (direction is not on a point).
function closedInSeriesOrder(trades: Trade[], series: PnlPoint[]): Trade[] {
  const byId = new Map(trades.map((trade) => [trade.id, trade]))
  return series
    .map((point) => byId.get(point.tradeId))
    .filter((trade): trade is Trade => trade !== undefined && trade.pnl !== null)
}

function highlight(trade: Trade): TradeHighlight {
  return {
    tradeId: trade.id,
    date: trade.date,
    asset: trade.asset,
    direction: trade.direction,
    pnl: trade.pnl as number
  }
}

function highlightsOf(closed: Trade[]): { best: TradeHighlight[]; worst: TradeHighlight[] } {
  if (closed.length === 0) return { best: [], worst: [] }
  const pnls = closed.map((trade) => trade.pnl as number)
  const highest = Math.max(...pnls)
  const lowest = Math.min(...pnls)
  return {
    best: highest > 0 ? closed.filter((trade) => trade.pnl === highest).map(highlight) : [],
    worst: lowest < 0 ? closed.filter((trade) => trade.pnl === lowest).map(highlight) : []
  }
}

interface Bucket {
  key: string
  label: string
  pnls: number[]
}

function addTo(map: Map<string, Bucket>, key: string, label: string, pnl: number): void {
  const bucket = map.get(key)
  if (bucket) bucket.pnls.push(pnl)
  else map.set(key, { key, label, pnls: [pnl] })
}

function rowOf(bucket: Bucket): BreakdownRow {
  const wins = bucket.pnls.filter((pnl) => pnl > 0)
  const losses = bucket.pnls.filter((pnl) => pnl < 0)
  const totalPnl = sum(bucket.pnls)
  const grossWin = sum(wins)
  const grossLoss = Math.abs(sum(losses))
  return {
    key: bucket.key,
    label: bucket.label,
    closed: bucket.pnls.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / bucket.pnls.length) * 100,
    totalPnl,
    avgPnl: round8(totalPnl / bucket.pnls.length),
    profitFactor: grossLoss > 0 ? round8(grossWin / grossLoss) : null,
    fewTrades: bucket.pnls.length < MIN_GROUP_TRADES
  }
}

function rowsOf(map: Map<string, Bucket>): BreakdownRow[] {
  return [...map.values()]
    .map(rowOf)
    .sort((a, b) => b.totalPnl - a.totalPnl || a.label.localeCompare(b.label))
}

// Assets are stored uppercase by the app, but old imports can differ. Group by
// the trimmed, lower-cased name and show the spelling used most often; on a tie
// the one seen first wins. (The Assistant's pnl_by_asset groups by the exact
// stored string; README documents the difference.)
function assetRows(closed: Trade[]): BreakdownRow[] {
  const buckets = new Map<string, Bucket & { spellings: Map<string, { count: number; first: number }> }>()
  closed.forEach((trade, index) => {
    const spelling = trade.asset.trim()
    const key = spelling.toLowerCase()
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, label: '', pnls: [], spellings: new Map() }
      buckets.set(key, bucket)
    }
    bucket.pnls.push(trade.pnl as number)
    const seen = bucket.spellings.get(spelling)
    if (seen) seen.count++
    else bucket.spellings.set(spelling, { count: 1, first: index })
  })

  for (const bucket of buckets.values()) {
    let label = ''
    let bestCount = -1
    let bestFirst = Number.POSITIVE_INFINITY
    for (const [spelling, seen] of bucket.spellings) {
      if (seen.count > bestCount || (seen.count === bestCount && seen.first < bestFirst)) {
        label = spelling
        bestCount = seen.count
        bestFirst = seen.first
      }
    }
    bucket.label = label || '(no asset)'
  }

  return rowsOf(buckets)
}

function directionRows(closed: Trade[]): BreakdownRow[] {
  const buckets = new Map<string, Bucket>()
  for (const trade of closed) {
    addTo(buckets, trade.direction, trade.direction === 'long' ? 'Long' : 'Short', trade.pnl as number)
  }
  return rowsOf(buckets)
}

// A trade with several tags counts in every one of them, so tag rows do not
// add up to the summary. That is stated on the card.
function tagRows(closed: Trade[]): BreakdownRow[] {
  const buckets = new Map<string, Bucket>()
  for (const trade of closed) {
    for (const raw of trade.tags) {
      const tag = raw.trim()
      if (!tag) continue
      addTo(buckets, tag, tag, trade.pnl as number)
    }
  }
  return rowsOf(buckets)
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Weekday and month both come from the trade's ENTRY date, like Insights.
function weekdayRows(closed: Trade[]): BreakdownRow[] {
  const buckets = new Map<string, Bucket>()
  for (const trade of closed) {
    const day = new Date(`${trade.date}T00:00:00Z`).getUTCDay()
    const label = WEEKDAY_LABELS[day]
    if (!label) continue
    addTo(buckets, String(day), label, trade.pnl as number)
  }
  return rowsOf(buckets)
}

function monthRows(closed: Trade[]): BreakdownRow[] {
  const buckets = new Map<string, Bucket>()
  for (const trade of closed) {
    const key = trade.date.slice(0, 7)
    const month = Number(trade.date.slice(5, 7))
    if (key.length !== 7 || month < 1 || month > 12) continue
    addTo(buckets, key, `${MONTH_LABELS[month - 1]} ${trade.date.slice(0, 4)}`, trade.pnl as number)
  }
  return rowsOf(buckets)
}

/** Every number the Analysis tab shows, from one pass over the fetched trades. */
export function analyzeTrades(trades: Trade[]): TradeAnalysis {
  const series = pnlSeries(trades)
  const closed = closedInSeriesOrder(trades, series)
  return {
    summary: summaryOf(trades),
    series,
    drawdown: drawdownOf(series),
    streaks: streaksOf(series),
    ...highlightsOf(closed),
    breakdowns: {
      asset: assetRows(closed),
      direction: directionRows(closed),
      tag: tagRows(closed),
      weekday: weekdayRows(closed),
      month: monthRows(closed)
    }
  }
}
