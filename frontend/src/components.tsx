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
export type OptionChainSide = Omit<OptionChainRow, 'expiration' | 'expiry_years' | 'strike'>
export type OptionChainLadderRow = {
  strike: number
  call: OptionChainSide | null
  put: OptionChainSide | null
}

function format(value: number, digits = 4) {
  if (!Number.isFinite(value)) return '-'
  const roundedZero = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value
  return roundedZero.toFixed(digits)
}

function chartBounds(values: number[]) {
  if (values.length === 0) return { min: 0, max: 1, span: 1 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return { min, max, span }
}

function linePoints(values: number[], height = 64) {
  if (values.length < 2) return ''
  const { min, span } = chartBounds(values)
  const xPadding = 7
  const yTop = 10
  const yBottom = 12
  const drawableWidth = 100 - xPadding * 2
  const drawableHeight = height - yTop - yBottom
  return values
    .map((value, index) => {
      const x = xPadding + (index / (values.length - 1)) * drawableWidth
      const y = yTop + (1 - (value - min) / span) * drawableHeight
      return `${format(x, 2)},${format(y, 2)}`
    })
    .join(' ')
}

function chartLabel(value: number) {
  if (!Number.isFinite(value)) return '-'
  return Math.abs(value) <= 3 ? `${format(value * 100, 2)}%` : format(value, 2)
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
  const { min, max } = chartBounds(values)
  const last = values[values.length - 1]
  const points = linePoints(values)
  if (values.length < 2) {
    return (
      <div className="mini-chart">
        <div className="mini-chart-head"><span>{title}</span><strong>-</strong></div>
        <div className="empty-state compact-empty">No surface data</div>
      </div>
    )
  }

  return (
    <div className="mini-chart">
      <div className="mini-chart-head">
        <span>{title}</span>
        <strong>{chartLabel(last)}</strong>
      </div>
      <svg viewBox="0 0 100 64" role="img" aria-label={`${title} chart`}>
        <line x1="7" x2="93" y1="10" y2="10" className="chart-grid-line" />
        <line x1="7" x2="93" y1="31" y2="31" className="chart-grid-line" />
        <line x1="7" x2="93" y1="52" y2="52" className="chart-grid-line" />
        <text x="2" y="12" className="chart-axis-label">{chartLabel(max)}</text>
        <text x="2" y="55" className="chart-axis-label">{chartLabel(min)}</text>
        <polyline points={points} className="surface-line" />
      </svg>
      <div className="axis-row"><span>{xLabel}</span><span>{labels[0] ?? '-'}</span><span>{labels[labels.length - 1] ?? '-'}</span></div>
    </div>
  )
}

export function HedgeChart({ values }: { values: number[] }) {
  const { min, max } = chartBounds(values)
  const first = values[0]
  const last = values[values.length - 1]
  const points = linePoints(values, 76)
  if (values.length < 2) {
    return <div className="empty-state compact-empty">No hedging path</div>
  }

  return (
    <div className="hedge-chart-wrap">
      <svg viewBox="0 0 100 76" className="hedge-chart" role="img" aria-label="Delta hedging spot path">
        <line x1="7" x2="93" y1="10" y2="10" className="chart-grid-line" />
        <line x1="7" x2="93" y1="37" y2="37" className="chart-grid-line" />
        <line x1="7" x2="93" y1="64" y2="64" className="chart-grid-line" />
        <text x="2" y="12" className="chart-axis-label">${format(max, 2)}</text>
        <text x="2" y="67" className="chart-axis-label">${format(min, 2)}</text>
        <polyline points={points} className="hedge-line" />
      </svg>
      <div className="axis-row">
        <span>GBM path</span>
        <span>Start ${format(first, 2)}</span>
        <span>End ${format(last, 2)}</span>
      </div>
    </div>
  )
}

export function OptionChainTable({
  rows,
  selectedStrike,
  selectedKind,
  onSelect,
}: {
  rows: OptionChainLadderRow[]
  selectedStrike: number
  selectedKind: OptionKind
  onSelect: (row: OptionChainLadderRow, kind: OptionKind) => void
}) {
  if (rows.length === 0) {
    return <div className="empty-state">No chain loaded</div>
  }

  return (
    <div className="chain-table-wrap">
      <table className="data-table chain-table">
        <colgroup>
          <col className="chain-price-col call-col" />
          <col className="chain-price-col call-col" />
          <col className="chain-mid-col call-col" />
          <col className="chain-iv-col call-col" />
          <col className="chain-small-col call-col" />
          <col className="chain-oi-col call-col" />
          <col className="chain-strike-col" />
          <col className="chain-price-col put-col" />
          <col className="chain-price-col put-col" />
          <col className="chain-mid-col put-col" />
          <col className="chain-iv-col put-col" />
          <col className="chain-small-col put-col" />
          <col className="chain-oi-col put-col" />
        </colgroup>
        <thead>
          <tr className="chain-group-row">
            <th className="call-group" colSpan={6}>Calls</th>
            <th className="strike-header">Strike</th>
            <th className="put-group" colSpan={6}>Puts</th>
          </tr>
          <tr>
            <th>Bid</th>
            <th>Ask</th>
            <th className="mid-header">Mid</th>
            <th>IV</th>
            <th>Vol</th>
            <th>OI</th>
            <th className="strike-header">K</th>
            <th>Bid</th>
            <th>Ask</th>
            <th className="mid-header">Mid</th>
            <th>IV</th>
            <th>Vol</th>
            <th>OI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = `ladder-${row.strike}`
            const active = Math.abs(row.strike - selectedStrike) < 0.001
            return (
              <tr key={key} className={active ? 'active-row' : undefined}>
                <OptionSideCells side={row.call} sideName="call" active={active && selectedKind === 'call'} onSelect={() => onSelect(row, 'call')} />
                <td className="strike-cell">{format(row.strike, 2)}</td>
                <OptionSideCells side={row.put} sideName="put" active={active && selectedKind === 'put'} onSelect={() => onSelect(row, 'put')} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function OptionSideCells({
  side,
  sideName,
  active,
  onSelect,
}: {
  side: OptionChainSide | null
  sideName: OptionKind
  active: boolean
  onSelect: () => void
}) {
  const selectedClass = active ? ' selected-contract' : ''
  return (
    <>
      <td className={`${sideName}-cell bidask-cell${selectedClass}`}>{formatNullable(side?.bid ?? null, 2)}</td>
      <td className={`${sideName}-cell bidask-cell${selectedClass}`}>{formatNullable(side?.ask ?? null, 2)}</td>
      <td className={`${sideName}-cell mid-cell${selectedClass}`}>
        {side ? <button type="button" className="quote-button" onClick={onSelect} title="Select contract">{formatNullable(side.mid, 2)}</button> : '-'}
      </td>
      <td className={`${sideName}-cell iv-cell${selectedClass}`}>{percentNullable(side?.implied_volatility ?? null)}</td>
      <td className={`${sideName}-cell activity-cell${selectedClass}`}>{side?.volume ?? '-'}</td>
      <td className={`${sideName}-cell activity-cell${selectedClass}`}>{side?.open_interest ?? '-'}</td>
    </>
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
