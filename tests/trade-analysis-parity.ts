// Cross-checks the Analysis tab against the ONE trade maths in shared/trades.ts.
// The point is that the new screen cannot drift into a second answer:
//   npm test
import assert from 'node:assert/strict'
import { analyzeTrades, MIN_GROUP_TRADES } from '../src/shared/tradeAnalysis'
import { computeStats, pnlSeries, round8 } from '../src/shared/trades'
import { trades as fixtureTrades } from '../src/renderer/src/preview/fixtures'
import type { Direction, Trade } from '../src/shared/types'

let n = 0
const test = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }

const total = (values: number[]): number => round8(values.reduce((a, b) => a + b, 0))

// The largest peak-to-later-trough fall, checked by trying every pair. This is
// deliberately a different shape from the running-peak pass in the module.
function bruteDrawdown(points: ReturnType<typeof pnlSeries>): number {
  const values = [0, ...points.map((p) => p.cumulative)]
  let best = 0
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) best = Math.max(best, round8(values[i] - values[j]))
  }
  return best
}

function checkAgainstShared(trades: Trade[]): void {
  const a = analyzeTrades(trades)
  const stats = computeStats(trades)
  const series = pnlSeries(trades)

  assert.equal(a.summary.total, stats.total)
  assert.equal(a.summary.open, stats.open)
  assert.equal(a.summary.closed, stats.closed)
  assert.equal(a.summary.wins, stats.wins)
  assert.equal(a.summary.losses, stats.losses)
  assert.equal(a.summary.breakeven, stats.closed - stats.wins - stats.losses)
  assert.equal(a.summary.winRate, stats.winRate)
  assert.equal(a.summary.totalPnl, stats.totalPnl)
  assert.equal(a.summary.avgWin, stats.avgWin)
  assert.equal(a.summary.avgLoss, stats.avgLoss)
  assert.equal(a.summary.profitFactor, stats.profitFactor)

  assert.deepEqual(a.series, series)
  assert.equal(a.series.length, stats.closed)
  if (a.series.length > 0) assert.equal(a.series[a.series.length - 1].cumulative, stats.totalPnl)

  // A best is only named when the best P&L is positive; a worst only when the
  // worst is negative. When present, the value must equal computeStats' one.
  if (stats.best !== null && stats.best > 0) assert.equal(a.best[0]?.pnl, stats.best)
  else assert.deepEqual(a.best, [])
  if (stats.worst !== null && stats.worst < 0) assert.equal(a.worst[0]?.pnl, stats.worst)
  else assert.deepEqual(a.worst, [])

  assert.equal(a.drawdown.amount, bruteDrawdown(series))
  assert.ok(a.drawdown.amount >= 0)
  if (a.drawdown.amount === 0) {
    assert.equal(a.drawdown.troughIndex, -1)
    assert.equal(a.drawdown.troughDate, null)
  } else {
    assert.ok(a.drawdown.troughIndex >= 0 && a.drawdown.troughIndex < series.length)
    assert.ok(a.drawdown.peakIndex >= -1 && a.drawdown.peakIndex < a.drawdown.troughIndex)
    assert.ok(a.drawdown.peakValue > a.drawdown.troughValue)
  }

  assert.ok(a.streaks.longestWin >= 0 && a.streaks.longestLoss >= 0)
  assert.ok(a.streaks.longestWin + a.streaks.longestLoss <= stats.closed)

  // Asset, direction, weekday and month each partition the closed trades;
  // tag rows may not, because one trade can carry several tags.
  for (const name of ['asset', 'direction', 'weekday', 'month'] as const) {
    const rows = a.breakdowns[name]
    assert.equal(total(rows.map((row) => row.closed)), stats.closed, `${name} closed total`)
    assert.equal(total(rows.map((row) => row.totalPnl)), stats.totalPnl, `${name} P&L total`)
  }
  // Every tag on a closed trade gets one row contribution; untagged trades
  // contribute none, so this total is not expected to equal `closed`.
  const tagOccurrences = trades
    .filter((trade) => trade.pnl !== null)
    .reduce((count, trade) => count + trade.tags.filter((tag) => tag.trim().length > 0).length, 0)
  assert.equal(total(a.breakdowns.tag.map((row) => row.closed)), tagOccurrences)

  for (const name of ['asset', 'direction', 'tag', 'weekday', 'month'] as const) {
    for (const row of a.breakdowns[name]) {
      assert.ok(row.closed > 0)
      assert.ok(row.wins + row.losses <= row.closed)
      assert.ok(row.winRate >= 0 && row.winRate <= 100)
      assert.equal(row.fewTrades, row.closed < MIN_GROUP_TRADES)
      assert.equal(row.key.length > 0, true)
      assert.equal(row.label.length > 0, true)
    }
  }
}

test('the preview fixtures agree with computeStats and pnlSeries', () => {
  checkAgainstShared(fixtureTrades)
})

test('the preview fixtures still have the documented shape (26 closed, 1 open)', () => {
  const a = analyzeTrades(fixtureTrades)
  assert.equal(a.summary.total, 27)
  assert.equal(a.summary.closed, 26)
  assert.equal(a.summary.open, 1)
  assert.equal(a.series.length, 26)
})

// A deterministic pseudo-random set: different prices, directions, tags and
// same-day clusters, plus open trades. No Math.random, so a failure is
// reproducible from the seed alone.
function seededTrades(): Trade[] {
  let seed = 123456789
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const assets = ['BTCUSD', 'btcusd ', ' XAUUSD', 'XAUUSD', 'ETHUSD']
  const tags = ['gold', 'crypto', 'fx', 'breakout']
  const start = Date.UTC(2025, 0, 1)
  const out: Trade[] = []
  for (let i = 0; i < 300; i++) {
    const open = rand() < 0.12
    const pnl = open ? null : round8((rand() - 0.5) * 200)
    const date = new Date(start + Math.floor(rand() * 700) * 86400000).toISOString().slice(0, 10)
    const direction: Direction = rand() < 0.5 ? 'long' : 'short'
    const ownTags = rand() < 0.35 ? [] : [tags[Math.floor(rand() * tags.length)], ...(rand() < 0.2 ? [tags[Math.floor(rand() * tags.length)]] : [])]
    out.push({
      id: i + 1, date, asset: assets[Math.floor(rand() * assets.length)], direction,
      entryPrice: 100, exitPrice: pnl === null ? null : 100 + pnl, quantity: 1, fees: 0,
      notes: '', tags: [...new Set(ownTags)], pnl, createdAt: '', updatedAt: ''
    })
  }
  return out
}

test('300 seeded trades agree with the shared maths', () => {
  checkAgainstShared(seededTrades())
})

test('the seeded run is deterministic and does not mutate its input', () => {
  const list = seededTrades()
  const before = JSON.parse(JSON.stringify(list)) as Trade[]
  assert.deepEqual(analyzeTrades(list), analyzeTrades(list))
  assert.deepEqual(list, before)
})

test('every recovered drawdown points at a real later trade', () => {
  const a = analyzeTrades(seededTrades())
  if (a.drawdown.recoveryDate !== null) {
    const trough = a.drawdown.troughIndex
    const recovery = a.series.findIndex((p, i) => i > trough && p.date === a.drawdown.recoveryDate && p.cumulative >= a.drawdown.peakValue)
    assert.ok(recovery > trough)
  }
})

test('an empty list and a single open trade are safe', () => {
  checkAgainstShared([])
  checkAgainstShared([{
    id: 1, date: '2026-11-01', asset: 'XAUUSD', direction: 'long', entryPrice: 100, exitPrice: null,
    quantity: 1, fees: 2, notes: '', tags: [], pnl: null, createdAt: '', updatedAt: ''
  }])
})

console.log(`\n${n} trade analysis parity checks passed`)
