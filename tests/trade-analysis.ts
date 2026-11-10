// Checks for the Trades > Analysis maths. No database and no UI:
//   npm test
import assert from 'node:assert/strict'
import {
  analyzeTrades, analysisDateFilter, MIN_GROUP_TRADES, SMALL_SAMPLE_TRADES,
  type AnalysisRange, type BreakdownName
} from '../src/shared/tradeAnalysis'
import { computeStats } from '../src/shared/trades'
import type { Direction, Trade } from '../src/shared/types'

let n = 0
const test = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }

let nextId = 1
// These tests feed a P&L directly: calcPnl and pnlSeries have their own checks
// in tests/trades.ts. Prices are filled so the row still looks like a Trade.
const trade = (pnl: number | null, opts: {
  id?: number; date?: string; asset?: string; direction?: Direction; tags?: string[]
} = {}): Trade => ({
  id: opts.id ?? nextId++,
  date: opts.date ?? '2026-11-01',
  asset: opts.asset ?? 'XAUUSD',
  direction: opts.direction ?? 'long',
  entryPrice: 100,
  exitPrice: pnl === null ? null : 100 + pnl,
  quantity: 1,
  fees: 0,
  notes: '',
  tags: opts.tags ?? [],
  pnl,
  createdAt: '',
  updatedAt: ''
})

const names: BreakdownName[] = ['asset', 'direction', 'tag', 'weekday', 'month']

test('the 5-trade and 30-trade thresholds are named constants', () => {
  assert.equal(MIN_GROUP_TRADES, 5)
  assert.equal(SMALL_SAMPLE_TRADES, 30)
})

test('the Analysis date filter keeps only from/to for every preset', () => {
  assert.deepEqual(analysisDateFilter({ preset: 'all' }, '2026-11-10'), {})
  assert.deepEqual(analysisDateFilter({ preset: 'this-year' }, '2026-11-10'), { from: '2026-01-01' })
  assert.deepEqual(analysisDateFilter({ preset: 'this-month' }, '2026-11-10'), { from: '2026-11-01' })
  assert.deepEqual(analysisDateFilter({ preset: 'last-30' }, '2026-11-10'), { from: '2026-10-12' })
  assert.deepEqual(analysisDateFilter({ preset: 'custom', from: '2026-10-01', to: '2026-10-31' }, '2026-11-10'),
    { from: '2026-10-01', to: '2026-10-31' })
  assert.deepEqual(analysisDateFilter({ preset: 'custom', from: '2026-10-01' }, '2026-11-10'), { from: '2026-10-01' })
  assert.deepEqual(analysisDateFilter({ preset: 'custom', to: '2026-10-31' }, '2026-11-10'), { to: '2026-10-31' })
})

test('the Analysis query carries no search, direction or tag filter', () => {
  // The Trades tab controls can be non-empty at the same time; none of these
  // keys may reach the analysis query builder.
  const polluted = {
    preset: 'this-year', text: 'btc', direction: 'short', tag: 'gold',
    from: undefined, to: undefined
  } as AnalysisRange & Record<string, unknown>
  const filter = analysisDateFilter(polluted, '2026-11-10')
  assert.deepEqual(filter, { from: '2026-01-01' })
  assert.deepEqual(Object.keys(filter), ['from'])

  const custom = analysisDateFilter(
    { preset: 'custom', from: '2026-10-01', to: '2026-10-31', text: 'x', direction: 'long', tag: 'y' } as AnalysisRange & Record<string, unknown>,
    '2026-11-10'
  )
  assert.deepEqual(Object.keys(custom).sort(), ['from', 'to'])
})

test('an empty range has empty results, not NaN', () => {
  const a = analyzeTrades([])
  assert.deepEqual(a.summary, {
    total: 0, open: 0, closed: 0, wins: 0, losses: 0, breakeven: 0, winRate: null, totalPnl: 0,
    avgWin: null, avgLoss: null, expectancy: null, payoff: null, profitFactor: null
  })
  assert.deepEqual(a.series, [])
  assert.deepEqual(a.streaks, { longestWin: 0, longestLoss: 0 })
  assert.deepEqual(a.best, [])
  assert.deepEqual(a.worst, [])
  assert.equal(a.drawdown.amount, 0)
  assert.equal(a.drawdown.troughIndex, -1)
  assert.equal(a.drawdown.peakDate, null)
  assert.equal(a.drawdown.troughDate, null)
  for (const name of names) assert.deepEqual(a.breakdowns[name], [])
})

test('open trades are counted but never touch the analysis', () => {
  const a = analyzeTrades([trade(null), trade(null)])
  assert.equal(a.summary.total, 2)
  assert.equal(a.summary.open, 2)
  assert.equal(a.summary.closed, 0)
  assert.equal(a.summary.totalPnl, 0)
  assert.deepEqual(a.series, [])
  assert.equal(a.drawdown.amount, 0)
  for (const name of names) assert.deepEqual(a.breakdowns[name], [])
})

test('one winning trade: summary, a single best and no invented worst', () => {
  const t = trade(10, { id: 7 })
  const a = analyzeTrades([t])
  assert.deepEqual(a.summary, {
    total: 1, open: 0, closed: 1, wins: 1, losses: 0, breakeven: 0, winRate: 100, totalPnl: 10,
    avgWin: 10, avgLoss: null, expectancy: 10, payoff: null, profitFactor: null
  })
  assert.deepEqual(a.series.map((p) => p.cumulative), [10])
  assert.deepEqual(a.streaks, { longestWin: 1, longestLoss: 0 })
  assert.deepEqual(a.best, [{ tradeId: 7, date: '2026-11-01', asset: 'XAUUSD', direction: 'long', pnl: 10 }])
  assert.deepEqual(a.worst, [])
  assert.equal(a.drawdown.amount, 0)
})

test('one losing trade: drawdown from the 0 baseline, no invented best', () => {
  const a = analyzeTrades([trade(-10)])
  assert.equal(a.summary.totalPnl, -10)
  assert.equal(a.summary.winRate, 0)
  assert.equal(a.summary.profitFactor, 0)
  assert.equal(a.summary.expectancy, -10)
  assert.equal(a.summary.payoff, null)
  assert.deepEqual(a.best, [])
  assert.equal(a.worst.length, 1)
  assert.deepEqual(a.drawdown, {
    amount: 10, peakValue: 0, peakDate: null, peakIndex: -1,
    troughValue: -10, troughDate: '2026-11-01', troughIndex: 0, recoveryDate: null
  })
})

test('all wins: profit factor and payoff stay null, no loss streak', () => {
  const a = analyzeTrades([trade(10), trade(30), trade(5)])
  assert.equal(a.summary.profitFactor, null)
  assert.equal(a.summary.payoff, null)
  assert.equal(a.summary.avgLoss, null)
  assert.deepEqual(a.streaks, { longestWin: 3, longestLoss: 0 })
  assert.equal(a.best.length, 1)
  assert.equal(a.best[0].pnl, 30)
  assert.deepEqual(a.worst, [])
})

test('all losses: profit factor 0, win rate 0, no win streak', () => {
  const a = analyzeTrades([trade(-10), trade(-3), trade(-8)])
  assert.equal(a.summary.profitFactor, 0)
  assert.equal(a.summary.payoff, null)
  assert.equal(a.summary.winRate, 0)
  assert.equal(a.summary.expectancy, -7)
  assert.deepEqual(a.streaks, { longestWin: 0, longestLoss: 3 })
  assert.equal(a.worst.length, 1)
  assert.equal(a.worst[0].pnl, -10)
  assert.deepEqual(a.best, [])
})

test('breakeven trades count as closed, sit in the win-rate denominator and earn 0', () => {
  const a = analyzeTrades([trade(10), trade(0), trade(0)])
  assert.equal(a.summary.closed, 3)
  assert.equal(a.summary.wins, 1)
  assert.equal(a.summary.losses, 0)
  assert.equal(a.summary.breakeven, 2)
  assert.equal(a.summary.winRate, 33.33333333333333)
  assert.equal(a.summary.expectancy, 3.33333333)
  assert.equal(a.summary.profitFactor, null)
  assert.deepEqual(a.streaks, { longestWin: 1, longestLoss: 0 })
})

test('breakeven ends both a win and a loss streak', () => {
  const a = analyzeTrades([trade(5), trade(5), trade(0), trade(-1), trade(-1), trade(-1)])
  assert.deepEqual(a.streaks, { longestWin: 2, longestLoss: 3 })
})

test('expectancy and payoff are net of the P&L (fees are already inside it)', () => {
  const a = analyzeTrades([trade(10), trade(20), trade(-10)])
  assert.equal(a.summary.totalPnl, 20)
  assert.equal(a.summary.expectancy, 6.66666667)
  assert.equal(a.summary.avgWin, 15)
  assert.equal(a.summary.avgLoss, -10)
  assert.equal(a.summary.payoff, 1.5)
  assert.equal(a.summary.profitFactor, 3)
})

test('small numbers keep 8-decimal hygiene', () => {
  const a = analyzeTrades([trade(0.1), trade(0.2)])
  assert.equal(a.summary.totalPnl, 0.3)
  assert.equal(a.summary.expectancy, 0.15)
  assert.equal(a.series[1].cumulative, 0.3)
  assert.equal(a.breakdowns.asset[0].avgPnl, 0.15)
})

test('drawdown is the largest peak-to-later-trough fall, in curve order', () => {
  // 10 -> 15 -> 17? No: the P&L values are per trade, so 10, -5, -3 gives 10, 5, 2.
  const a = analyzeTrades([trade(10), trade(-5), trade(-3)])
  assert.equal(a.drawdown.amount, 8)
  assert.equal(a.drawdown.peakValue, 10)
  assert.equal(a.drawdown.peakDate, '2026-11-01')
  assert.equal(a.drawdown.peakIndex, 0)
  assert.equal(a.drawdown.troughValue, 2)
  assert.equal(a.drawdown.troughIndex, 2)
  assert.equal(a.drawdown.recoveryDate, null)
})

test('a drawdown that fully recovers records the recovery trade date', () => {
  const a = analyzeTrades([
    trade(10, { date: '2026-11-01' }), trade(-5, { date: '2026-11-02' }),
    trade(-3, { date: '2026-11-03' }), trade(7, { date: '2026-11-04' }),
    trade(1, { date: '2026-11-05' })
  ])
  assert.equal(a.drawdown.amount, 8)
  assert.equal(a.drawdown.recoveryDate, '2026-11-05')
  assert.deepEqual(a.series.map((p) => p.cumulative), [10, 5, 2, 9, 10])
})

test('equal drawdowns pick the first one deterministically', () => {
  const a = analyzeTrades([trade(10), trade(-4), trade(4), trade(-4)])
  assert.equal(a.drawdown.amount, 4)
  assert.equal(a.drawdown.peakIndex, 0)
  assert.equal(a.drawdown.troughIndex, 1)
  assert.equal(a.drawdown.recoveryDate, '2026-11-01') // same entry date, lower id first
})

test('a curve that never falls has no drawdown and no trough', () => {
  const a = analyzeTrades([trade(5), trade(10)])
  assert.equal(a.drawdown.amount, 0)
  assert.equal(a.drawdown.troughIndex, -1)
  assert.equal(a.drawdown.troughDate, null)
  assert.equal(a.drawdown.recoveryDate, null)
})

test('best and worst keep every tie, in curve order', () => {
  const a = analyzeTrades([
    trade(10, { id: 1, date: '2026-10-01' }), trade(-5, { id: 2, date: '2026-10-02' }),
    trade(10, { id: 3, date: '2026-10-03' }), trade(-5, { id: 4, date: '2026-10-04' })
  ])
  assert.deepEqual(a.best.map((t) => t.tradeId), [1, 3])
  assert.deepEqual(a.worst.map((t) => t.tradeId), [2, 4])
})

test('best is only named for a real win and worst only for a real loss', () => {
  const wins = analyzeTrades([trade(3), trade(5)])
  assert.deepEqual(wins.best.map((t) => t.pnl), [5])
  assert.deepEqual(wins.worst, [])
  const losses = analyzeTrades([trade(-3), trade(-5)])
  assert.deepEqual(losses.best, [])
  assert.deepEqual(losses.worst.map((t) => t.pnl), [-5])
})

test('asset groups ignore case and surrounding spaces and show the commonest spelling', () => {
  const a = analyzeTrades([
    trade(1, { asset: 'XAUUSD' }), trade(2, { asset: ' xauusd ' }), trade(3, { asset: 'XAUUSD' }), trade(4, { asset: 'XauUsd' })
  ])
  assert.equal(a.breakdowns.asset.length, 1)
  assert.equal(a.breakdowns.asset[0].label, 'XAUUSD')
  assert.equal(a.breakdowns.asset[0].closed, 4)
  assert.equal(a.breakdowns.asset[0].totalPnl, 10)
  assert.equal(a.breakdowns.asset[0].fewTrades, true)
})

test('an asset spelling tie keeps the spelling seen first', () => {
  const a = analyzeTrades([trade(1, { asset: 'EURUSD' }), trade(2, { asset: 'eurusd' })])
  assert.equal(a.breakdowns.asset[0].label, 'EURUSD')
})

test('a blank asset becomes one honest (no asset) row', () => {
  const a = analyzeTrades([trade(1, { asset: '   ' }), trade(2, { asset: '' })])
  assert.equal(a.breakdowns.asset.length, 1)
  assert.equal(a.breakdowns.asset[0].label, '(no asset)')
})

test('tag rows count a trade once per tag, and an untagged trade has no row', () => {
  const a = analyzeTrades([
    trade(10, { tags: ['gold', 'breakout'] }), trade(5, { tags: ['gold', 'breakout'] }), trade(-1, { tags: [] })
  ])
  const gold = a.breakdowns.tag.find((r) => r.label === 'gold')!
  const breakout = a.breakdowns.tag.find((r) => r.label === 'breakout')!
  assert.equal(gold.closed, 2)
  assert.equal(breakout.closed, 2)
  assert.equal(a.breakdowns.tag.length, 2)
  assert.equal(gold.totalPnl + breakout.totalPnl, 30) // double counting, by design
})

test('weekdays come from the entry date and are labelled in one place', () => {
  const a = analyzeTrades([
    trade(1, { date: '2026-11-09' }), trade(2, { date: '2026-11-09' }), trade(3, { date: '2026-11-08' })
  ])
  const monday = a.breakdowns.weekday.find((r) => r.key === '1')!
  const sunday = a.breakdowns.weekday.find((r) => r.key === '0')!
  assert.equal(monday.label, 'Mon')
  assert.equal(monday.closed, 2)
  assert.equal(sunday.label, 'Sun')
  assert.equal(sunday.closed, 1)
})

test('months group by YYYY-MM and label the year', () => {
  const a = analyzeTrades([
    trade(1, { date: '2026-01-15' }), trade(2, { date: '2026-02-01' }), trade(3, { date: '2025-12-31' })
  ])
  assert.deepEqual(a.breakdowns.month.map((r) => r.label).sort(), ['Dec 2025', 'Feb 2026', 'Jan 2026'])
  assert.equal(a.breakdowns.month.find((r) => r.key === '2026-01')!.closed, 1)
})

test('a group with 4 closed trades is "few", with 5 it is not', () => {
  const many = [1, 2, 3, 4, 5].map((pnl) => trade(pnl, { asset: 'AAA' }))
  const few = [1, 2, 3, 4].map((pnl) => trade(pnl, { asset: 'BBB' }))
  const a = analyzeTrades([...many, ...few])
  assert.equal(a.breakdowns.asset.find((r) => r.label === 'AAA')!.fewTrades, false)
  assert.equal(a.breakdowns.asset.find((r) => r.label === 'BBB')!.fewTrades, true)
})

test('breakdown rows start sorted by total P&L, then label', () => {
  const a = analyzeTrades([
    trade(10, { asset: 'AAA' }), trade(20, { asset: 'BBB' }), trade(10, { asset: 'CCC' })
  ])
  assert.deepEqual(a.breakdowns.asset.map((r) => r.label), ['BBB', 'AAA', 'CCC'])
})

test('a group row never claims a best/worst title and carries its own sample', () => {
  const a = analyzeTrades([trade(10, { asset: 'AAA' }), trade(-5, { asset: 'AAA' }), trade(-1, { asset: 'BBB' })])
  for (const row of a.breakdowns.asset) {
    assert.equal(typeof row.closed, 'number')
    assert.ok(row.closed > 0)
    assert.ok(row.winRate >= 0 && row.winRate <= 100)
    assert.ok(!('best' in row) && !('worst' in row))
  }
})

test('the input list is not reordered or changed', () => {
  const list = [
    trade(5, { id: 2, date: '2026-10-05', asset: 'BBB' }),
    trade(-2, { id: 1, date: '2026-10-01', asset: 'aaa', tags: ['x'] })
  ]
  const before = JSON.parse(JSON.stringify(list)) as Trade[]
  analyzeTrades(list)
  assert.deepEqual(list, before)
})

test('running the analysis twice gives the same result', () => {
  const list = [trade(5), trade(-2), trade(0), trade(7)]
  assert.deepEqual(analyzeTrades(list), analyzeTrades(list))
})

console.log(`\n${n} trade analysis checks passed`)
