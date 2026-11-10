// Cumulative P&L for Trades > Analysis. One point per closed trade, oldest
// first. The shaded band is the largest peak-to-trough fall; the peak and
// trough stay marked, and the table carries the same numbers for keyboard and
// screen-reader users. Theme tokens only.
import { useMemo, useState, type MouseEvent } from 'react'
import type { Direction, PnlPoint } from '../../../shared/types'
import type { DrawdownInfo } from '../../../shared/tradeAnalysis'
import { formatDate } from '../lib/dates'
import { fmtAmount, fmtPnl, pnlColor } from '../lib/format'

const W = 720, H = 190
const PAD = { l: 64, r: 12, t: 14, b: 14 }

// Axis values: "1.2k", "-350", "0.5"
const axis = (n: number): string => {
  const a = Math.abs(n)
  if (a >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${+(n / 1e3).toFixed(0)}k`
  if (a >= 1e3) return `${+(n / 1e3).toFixed(1)}k`
  return String(+n.toFixed(a >= 10 ? 0 : a >= 1 ? 1 : 3))
}

const sideOf = (direction: Direction | undefined): string =>
  direction === 'long' ? 'Long' : direction === 'short' ? 'Short' : '-'

export function EquityCurve({ points, drawdown, directions }: {
  points: PnlPoint[]
  drawdown: DrawdownInfo
  /** Optional tradeId -> side, so the data table can name the side like the trade list. */
  directions?: Map<number, Direction>
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [tableOpen, setTableOpen] = useState(false)

  const values = useMemo(() => [0, ...points.map((point) => point.cumulative)], [points])
  const n = points.length
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo || 1) * 0.1
  const yMin = lo - pad
  const yMax = hi + pad

  const x = (i: number): number => PAD.l + (i / Math.max(1, n)) * (W - PAD.l - PAD.r)
  const y = (value: number): number => PAD.t + (1 - (value - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)

  if (points.length === 0) {
    return <p className="text-sm text-muted">No closed trades in this range.</p>
  }

  const line = values.map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`
  const last = values[n]
  const color = last > 0 ? 'text-pos' : last < 0 ? 'text-neg' : 'text-muted'

  const shown = hover ?? n
  const point = shown === 0 ? null : points[shown - 1]
  const ticks = [...new Set([hi, lo])].filter((value) => Math.abs(y(value) - y(0)) >= 16)

  // The band follows the curve from the peak to the trough, then closes along
  // the peak's level. Baseline peaks (peakIndex -1) sit at the left edge.
  const peakValueIndex = drawdown.troughIndex >= 0 ? drawdown.peakIndex + 1 : -1
  const troughValueIndex = drawdown.troughIndex >= 0 ? drawdown.troughIndex + 1 : -1
  let band = ''
  if (drawdown.amount > 0 && peakValueIndex >= 0 && troughValueIndex > peakValueIndex) {
    const parts = [`M${x(peakValueIndex).toFixed(1)} ${y(drawdown.peakValue).toFixed(1)}`]
    for (let i = peakValueIndex; i <= troughValueIndex; i++) {
      parts.push(`L${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`)
    }
    parts.push(`L${x(troughValueIndex).toFixed(1)} ${y(drawdown.peakValue).toFixed(1)} Z`)
    band = parts.join(' ')
  }

  // Keeps the two labels readable when a marker sits near an edge.
  const labelX = (i: number): number => x(i) + (x(i) > W * 0.72 ? -8 : 8)
  const labelAnchor = (i: number): 'start' | 'end' => (x(i) > W * 0.72 ? 'end' : 'start')
  // The trough label normally sits below the marker, but never on top of the
  // zero line and never past the bottom edge.
  const troughBelow = y(drawdown.troughValue) < H - PAD.b - 30 &&
    Math.abs(y(drawdown.troughValue) - y(0)) >= 34

  const onMove = (event: MouseEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - box.left) / box.width) * W
    setHover(Math.max(0, Math.min(n, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * n))))
  }

  // The table's own running peak, so "drawdown from peak" starts at 0 and
  // matches the band (not the all-time history before this range).
  let runningPeak = 0
  const rows = points.map((current) => {
    runningPeak = Math.max(runningPeak, current.cumulative)
    return { ...current, peak: runningPeak, drawdown: current.cumulative < runningPeak ? runningPeak - current.cumulative : 0 }
  })

  return (
    <div>
      <div className="flex min-h-[2.5rem] flex-wrap items-baseline justify-between gap-x-4 text-sm" aria-live="polite"
        aria-label={`Cumulative P&L chart, ${n} closed ${n === 1 ? 'trade' : 'trades'}`}>
        <span className="text-muted">
          {point
            ? <>{formatDate(point.date)} · {point.asset} · <span className={pnlColor(point.pnl)}>{fmtPnl(point.pnl)}</span></>
            : 'Start'}
        </span>
        <span>Running total <span className={`font-semibold tabular-nums ${pnlColor(values[shown])}`}>{fmtPnl(values[shown])}</span>
          <span className="text-muted"> after {shown} {shown === 1 ? 'trade' : 'trades'}</span></span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className={`mt-1 w-full ${color}`} role="img"
        aria-label={`Cumulative P&L over ${n} closed ${n === 1 ? 'trade' : 'trades'}, now ${fmtPnl(last)}, largest drawdown ${fmtAmount(drawdown.amount)}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((value, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(value)} y2={y(value)} className="stroke-line" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(value) + 4} textAnchor="end" fontSize="12" className="fill-muted">{axis(value)}</text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="stroke-muted" strokeWidth="1" strokeDasharray="4 4" />
        <text x={PAD.l - 8} y={y(0) + 4} textAnchor="end" fontSize="12" className="fill-fg">0</text>

        {band && <path d={band} className="text-neg" fill="currentColor" opacity="0.14" />}
        <path d={area} className="text-muted" fill="currentColor" opacity="0.08" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {n <= 40 && values.slice(1).map((value, i) => <circle key={i} cx={x(i + 1)} cy={y(value)} r="2.5" fill="currentColor" />)}

        {drawdown.amount > 0 && peakValueIndex >= 0 && (
          <g className="text-fg">
            <circle cx={x(peakValueIndex)} cy={y(drawdown.peakValue)} r="4" fill="currentColor" className="stroke-card" strokeWidth="2" />
            <text x={labelX(peakValueIndex)} y={y(drawdown.peakValue) + (y(drawdown.peakValue) > PAD.t + 12 ? -9 : 18)}
              textAnchor={labelAnchor(peakValueIndex)} fontSize="12" className="fill-fg stroke-card"
              strokeWidth="3" paintOrder="stroke">
              {drawdown.peakDate ? 'Peak ' : 'Start '}{fmtPnl(drawdown.peakValue)}
            </text>
          </g>
        )}
        {drawdown.amount > 0 && troughValueIndex >= 0 && (
          <g className="text-fg">
            <circle cx={x(troughValueIndex)} cy={y(drawdown.troughValue)} r="4" fill="currentColor" className="stroke-card" strokeWidth="2" />
            <text x={labelX(troughValueIndex)} y={y(drawdown.troughValue) + (troughBelow ? 17 : -9)}
              textAnchor={labelAnchor(troughValueIndex)} fontSize="12" className="fill-fg stroke-card"
              strokeWidth="3" paintOrder="stroke">
              Trough {fmtPnl(drawdown.troughValue)}
            </text>
          </g>
        )}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-muted" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(values[hover])} r="5" fill="currentColor" className="stroke-card" strokeWidth="2" />
          </g>
        )}
      </svg>

      <p className="mt-1 text-xs text-muted">Closed trades only, in entry-date order. Drawdown starts from 0 at the start of the range.</p>

      <div className="mt-2">
        <button type="button" className="btn btn-sm" aria-expanded={tableOpen} aria-controls="equity-curve-table"
          onClick={() => setTableOpen((open) => !open)}>
          {tableOpen ? 'Hide data table' : 'Show data table'}
        </button>
        {tableOpen && (
          <div className="card mt-2 overflow-hidden">
            <div className="tbl-wrap">
              <table className="tbl" id="equity-curve-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Asset</th><th>Side</th>
                    <th className="r">P&L</th><th className="r">Running total</th><th className="r">From peak</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.tradeId}>
                      <td className="secondary whitespace-nowrap">{formatDate(row.date)}</td>
                      <td>{row.asset}</td>
                      <td className="secondary">{sideOf(directions?.get(row.tradeId))}</td>
                      <td className={`r ${pnlColor(row.pnl)}`}>{fmtPnl(row.pnl)}</td>
                      <td className="r tabular-nums">{fmtPnl(row.cumulative)}</td>
                      <td className="r tabular-nums">{row.drawdown === 0 ? '-' : fmtPnl(row.drawdown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
