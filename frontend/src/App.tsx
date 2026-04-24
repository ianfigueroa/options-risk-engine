import { Play, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type OptionKind = 'call' | 'put'

type FormState = {
  kind: OptionKind
  spot: number
  strike: number
  expiry: number
  rate: number
  volatility: number
}

type Greeks = {
  delta: number
  gamma: number
  vega: number
  theta: number
  rho: number
}

type StressRow = {
  label: string
  scenario_value?: number
  pnl: number
}

type HedgeResult = {
  terminal_spot: number
  hedging_error: number
  transaction_costs: number
  spot_path: number[]
  delta_path: number[]
}

type SurfaceResult = {
  interpolated_vol: number
  quote_count: number
  suspicious_quotes: unknown[]
  arbitrage_warnings: string[]
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

const defaultGreeks: Greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 }
const fallbackHedge: HedgeResult = {
  terminal_spot: 102,
  hedging_error: 0,
  transaction_costs: 0,
  spot_path: [100, 101, 99, 103, 102],
  delta_path: [0.54, 0.56, 0.51, 0.59, 0.58],
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(typeof body.detail === 'string' ? body.detail : 'request failed')
  }
  return (await response.json()) as T
}

function optionMarketPayload(form: FormState) {
  return {
    option: {
      kind: form.kind,
      strike: form.strike,
      time_to_expiry: form.expiry,
      exercise: 'european',
    },
    market: {
      spot: form.spot,
      rate: form.rate,
      dividend_yield: 0,
      volatility: form.volatility,
    },
  }
}

function format(value: number, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-'
}

function percent(value: number, digits = 2) {
  return `${format(value * 100, digits)}%`
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

function minMax(values: number[]) {
  if (values.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...values), max: Math.max(...values) }
}

export default function App() {
  const [form, setForm] = useState<FormState>({
    kind: 'call',
    spot: 100,
    strike: 100,
    expiry: 1,
    rate: 0.05,
    volatility: 0.2,
  })
  const [price, setPrice] = useState(0)
  const [iv, setIv] = useState(0)
  const [greeks, setGreeks] = useState<Greeks>(defaultGreeks)
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [portfolioGreeks, setPortfolioGreeks] = useState<Greeks>(defaultGreeks)
  const [stress, setStress] = useState<StressRow[]>([])
  const [hedge, setHedge] = useState<HedgeResult>(fallbackHedge)
  const [surfaceVol, setSurfaceVol] = useState(0)
  const [quoteCount, setQuoteCount] = useState(0)
  const [surfaceWarnings, setSurfaceWarnings] = useState(0)
  const [status, setStatus] = useState('API idle')
  const [loading, setLoading] = useState(false)

  const basePayload = useMemo(() => optionMarketPayload(form), [form])

  const runAnalytics = useCallback(async () => {
    setLoading(true)
    setStatus('Running analytics')
    try {
      const priceResponse = await postJson<{ price: number }>('/price', basePayload)
      const greeksResponse = await postJson<Greeks>('/greeks', basePayload)
      const ivResponse = await postJson<{ implied_volatility: number }>('/implied-vol', {
        ...basePayload,
        option_price: priceResponse.price,
      })
      const portfolioPayload = {
        positions: [
          { option: basePayload.option, quantity: 10 },
          { option: { kind: 'put', strike: form.strike * 0.95, time_to_expiry: form.expiry }, quantity: -4 },
        ],
        underlying_units: 25,
        cash: -500,
        market: basePayload.market,
      }
      const portfolioResponse = await postJson<{ value: number; greeks: Greeks }>('/portfolio-risk', portfolioPayload)
      const stressResponse = await postJson<{ scenarios: StressRow[] }>('/stress-test', portfolioPayload)
      const hedgeResponse = await postJson<HedgeResult>('/hedging-simulation', {
        ...basePayload,
        config: { steps: 60, rebalance_interval: 2, seed: 12, transaction_cost_rate: 0.001 },
      })
      const surfaceResponse = await postJson<SurfaceResult>('/vol-surface', {
        spot: form.spot,
        expiries: [0.25, 0.5, 1, 2],
        strikes: [form.spot * 0.8, form.spot * 0.9, form.spot, form.spot * 1.1, form.spot * 1.2],
        query_strike: form.strike,
        query_expiry: form.expiry,
      })

      setPrice(priceResponse.price)
      setGreeks(greeksResponse)
      setIv(ivResponse.implied_volatility)
      setPortfolioValue(portfolioResponse.value)
      setPortfolioGreeks(portfolioResponse.greeks)
      setStress(stressResponse.scenarios)
      setHedge(hedgeResponse)
      setSurfaceVol(surfaceResponse.interpolated_vol)
      setQuoteCount(surfaceResponse.quote_count)
      setSurfaceWarnings(surfaceResponse.suspicious_quotes.length + surfaceResponse.arbitrage_warnings.length)
      setStatus('API live')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'API unavailable')
    } finally {
      setLoading(false)
    }
  }, [basePayload, form.expiry, form.spot, form.strike])

  useEffect(() => {
    void runAnalytics()
  }, [runAnalytics])

  const intrinsic =
    form.kind === 'call' ? Math.max(form.spot - form.strike, 0) : Math.max(form.strike - form.spot, 0)
  const timeValue = Math.max(price - intrinsic, 0)
  const forward = form.spot * Math.exp(form.rate * form.expiry)
  const breakeven = form.kind === 'call' ? form.strike + price : form.strike - price
  const moneyness = form.spot / form.strike
  const hedgeRange = minMax(hedge.spot_path)

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Options Risk Engine</h1>
          <p className="subtitle">Pricing, Greeks, implied volatility, stress testing, and hedging simulation.</p>
        </div>
        <button className="run-button" onClick={runAnalytics} disabled={loading} title="Run analytics">
          {loading ? <RefreshCw className="spin" size={18} /> : <Play size={18} />}
          Run
        </button>
      </header>

      <section className="grid">
        <div className="panel controls">
          <div className="panel-title">Inputs</div>
          <label>Type<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OptionKind })}><option value="call">Call</option><option value="put">Put</option></select></label>
          <label>Spot<input type="number" value={form.spot} onChange={(event) => setForm({ ...form, spot: Number(event.target.value) })} /></label>
          <label>Strike<input type="number" value={form.strike} onChange={(event) => setForm({ ...form, strike: Number(event.target.value) })} /></label>
          <label>Expiry years<input type="number" step="0.05" value={form.expiry} onChange={(event) => setForm({ ...form, expiry: Number(event.target.value) })} /></label>
          <label>Rate<input type="number" step="0.005" value={form.rate} onChange={(event) => setForm({ ...form, rate: Number(event.target.value) })} /></label>
          <label>Volatility<input type="number" step="0.01" value={form.volatility} onChange={(event) => setForm({ ...form, volatility: Number(event.target.value) })} /></label>
          <div className="note">Model: European Black-Scholes, continuous rates, no discrete dividends.</div>
        </div>

        <div className="panel span-2">
          <div className="panel-title">Option summary</div>
          <div className="summary-grid">
            <div><span>Price</span><strong>${format(price, 4)}</strong></div>
            <div><span>Implied vol</span><strong>{percent(iv)}</strong></div>
            <div><span>Intrinsic</span><strong>${format(intrinsic, 4)}</strong></div>
            <div><span>Time value</span><strong>${format(timeValue, 4)}</strong></div>
            <div><span>Moneyness S/K</span><strong>{format(moneyness, 4)}</strong></div>
            <div><span>Forward</span><strong>{format(forward, 4)}</strong></div>
            <div><span>Breakeven</span><strong>{format(breakeven, 4)}</strong></div>
            <div><span>API status</span><strong>{status}</strong></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Surface query</div>
          <div className="metric-row"><span>Interpolated IV</span><strong>{percent(surfaceVol)}</strong></div>
          <div className="metric-row"><span>Query point</span><strong>K {format(form.strike, 2)} / T {format(form.expiry, 2)}</strong></div>
          <div className="metric-row"><span>Quote grid</span><strong>{quoteCount} quotes</strong></div>
          <div className="metric-row"><span>Surface warnings</span><strong>{surfaceWarnings}</strong></div>
          <div className="metric-row"><span>Status</span><strong>{status}</strong></div>
        </div>

        <div className="panel">
          <div className="panel-title">Option Greeks</div>
          <MetricTable rows={Object.entries(greeks).map(([key, value]) => [key, format(value)])} />
        </div>

        <div className="panel">
          <div className="panel-title">Portfolio</div>
          <MetricTable rows={[
            ['Long selected option', '10'],
            ['Short 95% strike put', '-4'],
            ['Underlying shares', '25'],
            ['Cash', '-500'],
            ['Value', `$${format(portfolioValue, 2)}`],
          ]} />
        </div>

        <div className="panel">
          <div className="panel-title">Portfolio Greeks</div>
          <MetricTable rows={Object.entries(portfolioGreeks).map(([key, value]) => [key, format(value)])} />
        </div>

        <div className="panel wide">
          <div className="panel-title">Stress test PnL</div>
          <table className="data-table">
            <thead><tr><th>Scenario</th><th>Portfolio PnL</th><th>Scenario value</th></tr></thead>
            <tbody>
              {stress.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className={row.pnl >= 0 ? 'positive' : 'negative'}>{format(row.pnl, 2)}</td>
                  <td>{row.scenario_value === undefined ? '-' : format(row.scenario_value, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel wide">
          <div className="panel-title">Delta Hedging</div>
          <svg viewBox="0 0 100 100" className="chart" role="img" aria-label="Hedging spot path">
            <polyline points={sparkline(hedge.spot_path)} />
          </svg>
          <div className="summary-grid compact">
            <div><span>Hedging error</span><strong>{format(hedge.hedging_error, 4)}</strong></div>
            <div><span>Transaction costs</span><strong>{format(hedge.transaction_costs, 4)}</strong></div>
            <div><span>Terminal spot</span><strong>{format(hedge.terminal_spot, 4)}</strong></div>
            <div><span>Spot range</span><strong>{format(hedgeRange.min, 2)} - {format(hedgeRange.max, 2)}</strong></div>
            <div><span>Rebalance samples</span><strong>{hedge.delta_path.length}</strong></div>
          </div>
        </div>
      </section>
    </main>
  )
}

function MetricTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="metric-table">
      <tbody>
        {rows.map(([label, value]) => <tr key={label}><td>{label}</td><td>{value}</td></tr>)}
      </tbody>
    </table>
  )
}
