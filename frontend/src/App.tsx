import { Activity, Calculator, LineChart, Play, RefreshCw, ShieldAlert } from 'lucide-react'
import type { CSSProperties } from 'react'
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
  pnl: number
}

type HedgeResult = {
  hedging_error: number
  transaction_costs: number
  spot_path: number[]
  delta_path: number[]
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

const defaultGreeks: Greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 }
const fallbackHedge: HedgeResult = {
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
      const surfaceResponse = await postJson<{ interpolated_vol: number; quote_count: number }>('/vol-surface', {
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

  const stressMax = Math.max(1, ...stress.map((row) => Math.abs(row.pnl)))

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Options Risk Engine</p>
          <h1>Vol Surface Lab</h1>
        </div>
        <button className="run-button" onClick={runAnalytics} disabled={loading} title="Run analytics">
          {loading ? <RefreshCw className="spin" size={18} /> : <Play size={18} />}
          Run
        </button>
      </header>

      <section className="grid">
        <div className="panel controls">
          <div className="panel-title"><Calculator size={18} /> Pricing Inputs</div>
          <label>Type<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OptionKind })}><option value="call">Call</option><option value="put">Put</option></select></label>
          <label>Spot<input type="number" value={form.spot} onChange={(event) => setForm({ ...form, spot: Number(event.target.value) })} /></label>
          <label>Strike<input type="number" value={form.strike} onChange={(event) => setForm({ ...form, strike: Number(event.target.value) })} /></label>
          <label>Expiry<input type="number" step="0.05" value={form.expiry} onChange={(event) => setForm({ ...form, expiry: Number(event.target.value) })} /></label>
          <label>Rate<input type="number" step="0.005" value={form.rate} onChange={(event) => setForm({ ...form, rate: Number(event.target.value) })} /></label>
          <label>Vol<input type="number" step="0.01" value={form.volatility} onChange={(event) => setForm({ ...form, volatility: Number(event.target.value) })} /></label>
          <div className="assumptions"><ShieldAlert size={16} /> European BS, continuous rates, no discrete dividends</div>
        </div>

        <div className="panel hero-metric">
          <div className="panel-title"><Activity size={18} /> Live Valuation</div>
          <div className="price">${format(price, 4)}</div>
          <div className="metric-row"><span>Implied vol</span><strong>{format(iv * 100, 2)}%</strong></div>
          <div className="metric-row"><span>Status</span><strong>{status}</strong></div>
        </div>

        <div className="panel">
          <div className="panel-title"><LineChart size={18} /> Greeks</div>
          <div className="greek-grid">
            {Object.entries(greeks).map(([key, value]) => <div key={key}><span>{key}</span><strong>{format(value)}</strong></div>)}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Portfolio</div>
          <table><tbody><tr><td>Long calls</td><td>10</td></tr><tr><td>Short 95% puts</td><td>-4</td></tr><tr><td>Underlying</td><td>25</td></tr><tr><td>Cash</td><td>-500</td></tr></tbody></table>
          <div className="metric-row"><span>Value</span><strong>${format(portfolioValue, 2)}</strong></div>
          <div className="metric-row"><span>Delta</span><strong>{format(portfolioGreeks.delta, 3)}</strong></div>
        </div>

        <div className="panel wide">
          <div className="panel-title">Stress Heatmap</div>
          <div className="heatmap">
            {stress.map((row) => <div key={row.label} className="heat-cell" style={{ '--tone': `${Math.abs(row.pnl) / stressMax}` } as CSSProperties}><span>{row.label}</span><strong>{format(row.pnl, 2)}</strong></div>)}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Vol Surface</div>
          <div className="surface-meter"><div style={{ width: `${Math.min(100, surfaceVol * 300)}%` }} /></div>
          <div className="metric-row"><span>Interpolated vol</span><strong>{format(surfaceVol * 100, 2)}%</strong></div>
          <div className="metric-row"><span>Quotes</span><strong>{quoteCount}</strong></div>
        </div>

        <div className="panel wide">
          <div className="panel-title">Delta Hedging</div>
          <svg viewBox="0 0 100 100" className="chart" role="img" aria-label="Hedging spot path">
            <polyline points={sparkline(hedge.spot_path)} />
          </svg>
          <div className="metric-strip"><span>Error {format(hedge.hedging_error, 4)}</span><span>Costs {format(hedge.transaction_costs, 4)}</span><span>Rebalances {hedge.delta_path.length}</span></div>
        </div>
      </section>
    </main>
  )
}
