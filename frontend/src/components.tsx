import { useState, type PointerEvent } from 'react'

type OptionKind = 'call' | 'put'
type PayoffPoint = {
  terminalSpot: number
  payoff: number
  profit: number
  x: number
  payoffY: number
  profitY: number
}
export type OptionChainRow = {
  expiration: string
  expiry_years: number
  strike: number
  bid: number | null
  ask: number | null
  last_price: number | null
  mid: number | null
  implied_volatility: number | null
  volume: number | null
  open_interest: number | null
}

function format(value: number, digits = 4) {
  if (!Number.isFinite(value)) return '-'
  const roundedZero = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value
  return roundedZero.toFixed(digits)
}

function sparkline(values: number[]) {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100
      const y = 100 - ((value - min) / span) * 100
      return `${x},${y}`
    })
    .join(' ')
}

export function MetricTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="metric-table">
      <tbody>
        {rows.map(([label, value]) => <tr key={label}><td>{label}</td><td>{value}</td></tr>)}
      </tbody>
    </table>
  )
}

export function BarChart({
  rows,
  valuePrefix = '',
  digits = 2,
}: {
  rows: Array<[string, number]>
  valuePrefix?: string
  digits?: number
}) {
  const maxAbs = Math.max(1e-8, ...rows.map(([, value]) => Math.abs(value)))
  return (
    <div className="bar-chart">
      {rows.map(([label, value]) => {
        const width = `${Math.max(4, Math.abs(value) / maxAbs * 100)}%`
        return (
          <div className="bar-row" key={label}>
            <span>{label}</span>
            <div className="bar-track"><div className={value >= 0 ? 'bar positive-bar' : 'bar negative-bar'} style={{ width }} /></div>
            <strong>{valuePrefix}{format(value, digits)}</strong>
          </div>
        )
      })}
    </div>
  )
}

export function MiniLine({
  title,
  xLabel,
  values,
  labels,
}: {
  title: string
  xLabel: string
  values: number[]
  labels: string[]
}) {
  return (
    <div className="mini-chart">
      <div className="mini-title">{title}</div>
      <svg viewBox="0 0 100 50" role="img" aria-label={`${title} chart`}>
        <polyline points={sparkline(values)} />
      </svg>
      <div className="axis-row"><span>{xLabel}</span><span>{labels[0] ?? '-'}</span><span>{labels[labels.length - 1] ?? '-'}</span></div>
    </div>
  )
}

export function OptionChainTable({
  rows,
  selectedStrike,
  onSelect,
}: {
  rows: OptionChainRow[]
  selectedStrike: number
  onSelect: (row: OptionChainRow) => void
}) {
  if (rows.length === 0) {
    return <div className="empty-state">No chain loaded</div>
  }

  return (
    <div className="chain-table-wrap">
      <table className="data-table chain-table">
        <thead>
          <tr>
            <th>Strike</th>
            <th>Bid</th>
            <th>Ask</th>
            <th>Mid</th>
            <th>IV</th>
            <th>Vol</th>
            <th>OI</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = `${row.expiration}-${row.strike}`
            const active = Math.abs(row.strike - selectedStrike) < 0.001
            return (
              <tr key={key} className={active ? 'active-row' : undefined}>
                <td>{format(row.strike, 2)}</td>
                <td>{formatNullable(row.bid, 2)}</td>
                <td>{formatNullable(row.ask, 2)}</td>
                <td>{formatNullable(row.mid, 2)}</td>
                <td>{percentNullable(row.implied_volatility)}</td>
                <td>{row.volume ?? '-'}</td>
                <td>{row.open_interest ?? '-'}</td>
                <td><button type="button" className="table-button" onClick={() => onSelect(row)}>Select</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PayoffChart({
  kind,
  spot,
  strike,
  premium,
  breakeven,
}: {
  kind: OptionKind
  spot: number
  strike: number
  premium: number
  breakeven: number
}) {
  const low = Math.max(0.01, Math.min(spot, strike, breakeven) * 0.72)
  const high = Math.max(spot, strike, breakeven) * 1.28
  const spots = Array.from({ length: 49 }, (_, index) => low + ((high - low) * index) / 48)
  const payoff = spots.map((terminalSpot) =>
    kind === 'call' ? Math.max(terminalSpot - strike, 0) : Math.max(strike - terminalSpot, 0),
  )
  const profit = payoff.map((value) => value - premium)
  const yValues = [...payoff, ...profit, 0]
  const yMin = Math.min(...yValues)
  const yMax = Math.max(...yValues)
  const ySpan = yMax - yMin || 1
  const xOf = (value: number) => ((value - low) / (high - low)) * 100
  const yOf = (value: number) => 88 - ((value - yMin) / ySpan) * 72
  const toPoints = (values: number[]) =>
    values.map((value, index) => `${xOf(spots[index])},${yOf(value)}`).join(' ')
  const zeroY = yOf(0)
  const [selectedPoint, setSelectedPoint] = useState<PayoffPoint | null>(null)
  const markerRows: Array<[string, number, string]> = [
    ['Spot', spot, `$${format(spot, 2)}`],
    ['Strike', strike, `$${format(strike, 2)}`],
    ['B/E', breakeven, `$${format(breakeven, 2)}`],
  ]
  const inspectAt = (terminalSpot: number): PayoffPoint => {
    const boundedSpot = Math.min(high, Math.max(low, terminalSpot))
    const inspectedPayoff = kind === 'call' ? Math.max(boundedSpot - strike, 0) : Math.max(strike - boundedSpot, 0)
    const inspectedProfit = inspectedPayoff - premium
    return {
      terminalSpot: boundedSpot,
      payoff: inspectedPayoff,
      profit: inspectedProfit,
      x: xOf(boundedSpot),
      payoffY: yOf(inspectedPayoff),
      profitY: yOf(inspectedProfit),
    }
  }
  const inspectedPoint = selectedPoint ?? inspectAt(spot)

  function updateInspection(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100
    setSelectedPoint(inspectAt(low + ((high - low) * xPercent) / 100))
  }

  return (
    <div className="payoff-wrap">
      <div className="payoff-head">
        <span>Expiration payoff and profit</span>
        <span>{kind === 'call' ? 'Long call' : 'Long put'} using current model premium</span>
      </div>
      <svg
        viewBox="0 0 100 100"
        className="payoff-chart interactive-chart"
        role="img"
        aria-label="Option payoff and profit at expiration"
        onClick={updateInspection}
        onPointerMove={updateInspection}
      >
        <line x1="4" x2="98" y1={zeroY} y2={zeroY} className="axis-line" />
        {markerRows.map(([label, value]) => (
          <g key={label}>
            <line x1={xOf(value)} x2={xOf(value)} y1="10" y2="92" className="marker-line" />
          </g>
        ))}
        <line x1={inspectedPoint.x} x2={inspectedPoint.x} y1="8" y2="93" className="inspection-line" />
        <circle cx={inspectedPoint.x} cy={inspectedPoint.payoffY} r="1.4" className="payoff-dot" />
        <circle cx={inspectedPoint.x} cy={inspectedPoint.profitY} r="1.4" className="profit-dot" />
        <polyline points={toPoints(payoff)} className="payoff-line" />
        <polyline points={toPoints(profit)} className="profit-line" />
      </svg>
      <div className="inspection-readout">
        <span>Terminal ${format(inspectedPoint.terminalSpot, 2)}</span>
        <span>Payoff ${format(inspectedPoint.payoff, 2)}</span>
        <span>Profit ${format(inspectedPoint.profit, 2)}</span>
      </div>
      <div className="payoff-legend">
        <span><i className="payoff-key" />Payoff</span>
        <span><i className="profit-key" />Profit after premium</span>
        <span>Range ${format(low, 0)} - ${format(high, 0)}</span>
      </div>
      <div className="payoff-markers">
        {markerRows.map(([label, , value]) => <span key={label}>{label}: {value}</span>)}
      </div>
    </div>
  )
}

function formatNullable(value: number | null, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? format(value, digits) : '-'
}

function percentNullable(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? `${format(value * 100, 2)}%` : '-'
}
