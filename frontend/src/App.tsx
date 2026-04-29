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

type ScenarioGreekRow = Greeks & { label: string }

type ModelPrices = {
  black_scholes: number
  binomial: number
  monte_carlo: number
  local_vol: number
  stochastic_vol: number
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
  smile: Array<{ strike: number; implied_vol: number }>
  term_structure: Array<{ expiry: number; implied_vol: number }>
  suspicious_quotes: unknown[]
  arbitrage_warnings: string[]
}

type MarketSnapshot = {
  ticker: string
  price: number
  previous_close: number | null
  change: number | null
  change_percent: number | null
  currency: string
  source: string
  timestamp: string
  option_expirations: string[]
}

type LiveOptionQuote = {
  ticker: string
  kind: OptionKind
  requested_strike: number
  matched_strike: number
  expiration: string
  last_price: number | null
  bid: number | null
  ask: number | null
  mid: number | null
  implied_volatility: number | null
  volume: number | null
  open_interest: number | null
  source: string
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

const defaultGreeks: Greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 }
const defaultModelPrices: ModelPrices = {
  black_scholes: 0,
  binomial: 0,
  monte_carlo: 0,
  local_vol: 0,
  stochastic_vol: 0,
}
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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`)
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

function stressTone(pnl: number, maxAbsPnl: number) {
  const strength = Math.min(1, Math.abs(pnl) / Math.max(maxAbsPnl, 1))
  if (pnl > 0) return `rgba(68, 139, 84, ${0.18 + strength * 0.42})`
  if (pnl < 0) return `rgba(160, 73, 73, ${0.18 + strength * 0.42})`
  return '#20242a'
}

function modelRows(prices: ModelPrices): Array<[string, number]> {
  return [
    ['Black-Scholes', prices.black_scholes],
    ['Binomial', prices.binomial],
    ['Monte Carlo', prices.monte_carlo],
    ['Local vol', prices.local_vol],
    ['Stochastic vol', prices.stochastic_vol],
  ]
}

function moneynessStatus(form: FormState) {
  const distance = form.spot - form.strike
  const relativeDistance = Math.abs(distance) / Math.max(form.strike, 1)
  if (relativeDistance <= 0.005) return 'ATM'
  if (form.kind === 'call') return distance > 0 ? 'ITM' : 'OTM'
  return distance < 0 ? 'ITM' : 'OTM'
}

export default function App() {
  const [ticker, setTicker] = useState('AAPL')
  const [form, setForm] = useState<FormState>({
    kind: 'call',
    spot: 100,
    strike: 100,
    expiry: 1,
    rate: 0.05,
    volatility: 0.2,
  })
  const [marketPrice, setMarketPrice] = useState(10.45)
  const [price, setPrice] = useState(0)
  const [iv, setIv] = useState(0)
  const [manualIv, setManualIv] = useState(0)
  const [modelPrices, setModelPrices] = useState<ModelPrices>(defaultModelPrices)
  const [greeks, setGreeks] = useState<Greeks>(defaultGreeks)
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [portfolioGreeks, setPortfolioGreeks] = useState<Greeks>(defaultGreeks)
  const [stress, setStress] = useState<StressRow[]>([])
  const [scenarioGreekRows, setScenarioGreekRows] = useState<ScenarioGreekRow[]>([])
  const [hedge, setHedge] = useState<HedgeResult>(fallbackHedge)
  const [surfaceVol, setSurfaceVol] = useState(0)
  const [quoteCount, setQuoteCount] = useState(0)
  const [surfaceWarnings, setSurfaceWarnings] = useState(0)
  const [smile, setSmile] = useState<SurfaceResult['smile']>([])
  const [termStructure, setTermStructure] = useState<SurfaceResult['term_structure']>([])
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null)
  const [liveOptionQuote, setLiveOptionQuote] = useState<LiveOptionQuote | null>(null)
  const [status, setStatus] = useState('API idle')
  const [marketStatus, setMarketStatus] = useState('Market data idle')
  const [loading, setLoading] = useState(false)
  const [marketLoading, setMarketLoading] = useState(false)

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
      const manualIvResponse = await postJson<{ implied_volatility: number }>('/implied-vol', {
        ...basePayload,
        option_price: marketPrice,
      }).catch(() => ({ implied_volatility: Number.NaN }))
      const modelResponse = await postJson<ModelPrices>('/model-prices', basePayload)
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
      const scenarioGreeksResponse = await postJson<{ scenarios: ScenarioGreekRow[] }>('/scenario-greeks', portfolioPayload)
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
      setManualIv(manualIvResponse.implied_volatility)
      setModelPrices(modelResponse)
      setPortfolioValue(portfolioResponse.value)
      setPortfolioGreeks(portfolioResponse.greeks)
      setStress(stressResponse.scenarios)
      setScenarioGreekRows(scenarioGreeksResponse.scenarios)
      setHedge(hedgeResponse)
      setSurfaceVol(surfaceResponse.interpolated_vol)
      setQuoteCount(surfaceResponse.quote_count)
      setSurfaceWarnings(surfaceResponse.suspicious_quotes.length + surfaceResponse.arbitrage_warnings.length)
      setSmile(surfaceResponse.smile)
      setTermStructure(surfaceResponse.term_structure)
      setStatus('API live')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'API unavailable')
    } finally {
      setLoading(false)
    }
  }, [basePayload, form.expiry, form.spot, form.strike, marketPrice])

  useEffect(() => {
    void runAnalytics()
  }, [runAnalytics])

  const loadMarketSnapshot = useCallback(async () => {
    const symbol = ticker.trim().toUpperCase()
    if (!symbol) return
    setMarketLoading(true)
    setMarketStatus('Loading quote')
    try {
      const snapshot = await getJson<MarketSnapshot>(`/market-snapshots/${encodeURIComponent(symbol)}`)
      setMarketSnapshot(snapshot)
      setTicker(snapshot.ticker)
      setForm((current) => ({ ...current, spot: Number(snapshot.price.toFixed(4)) }))
      const query = new URLSearchParams({
        kind: form.kind,
        strike: String(form.strike),
        expiry_years: String(form.expiry),
      })
      const quote = await getJson<LiveOptionQuote>(`/option-quotes/${encodeURIComponent(symbol)}?${query}`)
      setLiveOptionQuote(quote)
      const livePrice = quote.mid ?? quote.last_price
      if (livePrice !== null) setMarketPrice(Number(livePrice.toFixed(4)))
      setMarketStatus(`${snapshot.source} live`)
    } catch (error) {
      setLiveOptionQuote(null)
      setMarketStatus(error instanceof Error ? error.message : 'Market data unavailable')
    } finally {
      setMarketLoading(false)
    }
  }, [form.expiry, form.kind, form.strike, ticker])

  const intrinsic =
    form.kind === 'call' ? Math.max(form.spot - form.strike, 0) : Math.max(form.strike - form.spot, 0)
  const timeValue = Math.max(price - intrinsic, 0)
  const forward = form.spot * Math.exp(form.rate * form.expiry)
  const breakeven = form.kind === 'call' ? form.strike + price : form.strike - price
  const moneyness = form.spot / form.strike
  const statusLabel = moneynessStatus(form)
  const distanceToStrike = Math.abs(form.spot - form.strike)
  const distanceToStrikePct = distanceToStrike / Math.max(form.strike, 1)
  const hedgeRange = minMax(hedge.spot_path)
  const maxStressPnl = Math.max(1, ...stress.map((row) => Math.abs(row.pnl)))
  const greekBars: Array<[string, number]> = Object.entries(greeks).map(([key, value]) => [key, value])

  function loadSampleTrade() {
    setForm({
      kind: 'call',
      spot: 103,
      strike: 105,
      expiry: 0.75,
      rate: 0.04,
      volatility: 0.28,
    })
    setMarketPrice(9.15)
  }

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
          <div className="ticker-control">
            <label>Ticker<input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} /></label>
            <button className="secondary-button" type="button" onClick={loadMarketSnapshot} disabled={marketLoading}>
              {marketLoading ? 'Loading' : 'Load market'}
            </button>
          </div>
          <div className="market-snapshot">
            <div><span>Live spot</span><strong>{marketSnapshot ? `$${format(marketSnapshot.price, 2)}` : '-'}</strong></div>
            <div><span>Change</span><strong className={(marketSnapshot?.change ?? 0) >= 0 ? 'positive' : 'negative'}>{marketSnapshot?.change === null || marketSnapshot?.change === undefined ? '-' : `${format(marketSnapshot.change, 2)} / ${percent(marketSnapshot.change_percent ?? 0)}`}</strong></div>
            <div><span>Option mid</span><strong>{liveOptionQuote?.mid === null || liveOptionQuote?.mid === undefined ? '-' : `$${format(liveOptionQuote.mid, 2)}`}</strong></div>
            <div><span>Matched contract</span><strong>{liveOptionQuote ? `${liveOptionQuote.expiration} / K ${format(liveOptionQuote.matched_strike, 0)}` : '-'}</strong></div>
            <div><span>Options dates</span><strong>{marketSnapshot ? marketSnapshot.option_expirations.length : '-'}</strong></div>
            <div><span>Market status</span><strong>{marketStatus}</strong></div>
          </div>
          <label>Type<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OptionKind })}><option value="call">Call</option><option value="put">Put</option></select></label>
          <label>Spot<input type="number" value={form.spot} onChange={(event) => setForm({ ...form, spot: Number(event.target.value) })} /></label>
          <label>Strike<input type="number" value={form.strike} onChange={(event) => setForm({ ...form, strike: Number(event.target.value) })} /></label>
          <label>Expiry years<input type="number" step="0.05" value={form.expiry} onChange={(event) => setForm({ ...form, expiry: Number(event.target.value) })} /></label>
          <label>Rate<input type="number" step="0.005" value={form.rate} onChange={(event) => setForm({ ...form, rate: Number(event.target.value) })} /></label>
          <label>Volatility<input type="number" step="0.01" value={form.volatility} onChange={(event) => setForm({ ...form, volatility: Number(event.target.value) })} /></label>
          <label>Market price<input type="number" step="0.01" value={marketPrice} onChange={(event) => setMarketPrice(Number(event.target.value))} /></label>
          <button className="secondary-button" type="button" onClick={loadSampleTrade}>Load sample trade</button>
          <div className="note">Model: European Black-Scholes, continuous rates, no discrete dividends.</div>
        </div>

        <div className="panel span-3 valuation-panel">
          <div className="panel-title">Option valuation</div>
          <div className="valuation-layout">
            <div className="summary-grid valuation-summary">
              <div><span>Price</span><strong>${format(price, 4)}</strong></div>
              <div><span>Status</span><strong>{statusLabel}</strong></div>
              <div><span>Market IV</span><strong>{percent(manualIv)}</strong></div>
              <div><span>Model IV</span><strong>{percent(iv)}</strong></div>
              <div><span>Intrinsic</span><strong>${format(intrinsic, 4)}</strong></div>
              <div><span>Time value</span><strong>${format(timeValue, 4)}</strong></div>
              <div><span>Moneyness S/K</span><strong>{format(moneyness, 4)}</strong></div>
              <div><span>Distance</span><strong>${format(distanceToStrike, 2)} / {percent(distanceToStrikePct)}</strong></div>
              <div><span>Forward</span><strong>{format(forward, 4)}</strong></div>
              <div><span>Breakeven</span><strong>{format(breakeven, 4)}</strong></div>
              <div><span>API status</span><strong>{status}</strong></div>
            </div>
            <PayoffChart kind={form.kind} spot={form.spot} strike={form.strike} premium={price} breakeven={breakeven} />
          </div>
        </div>

        <div className="panel span-2">
          <div className="panel-title">Surface query</div>
          <div className="metric-row"><span>Interpolated IV</span><strong>{percent(surfaceVol)}</strong></div>
          <div className="metric-row"><span>Query point</span><strong>K {format(form.strike, 2)} / T {format(form.expiry, 2)}</strong></div>
          <div className="metric-row"><span>Quote grid</span><strong>{quoteCount} quotes</strong></div>
          <div className="metric-row"><span>Surface warnings</span><strong>{surfaceWarnings}</strong></div>
          <div className="metric-row"><span>Status</span><strong>{status}</strong></div>
        </div>

        <div className="panel span-2">
          <div className="panel-title">Model prices</div>
          <BarChart rows={modelRows(modelPrices)} valuePrefix="$" />
          <MetricTable rows={[
            ['Black-Scholes', `$${format(modelPrices.black_scholes, 4)}`],
            ['Binomial tree', `$${format(modelPrices.binomial, 4)}`],
            ['Monte Carlo', `$${format(modelPrices.monte_carlo, 4)}`],
            ['Local vol MC', `$${format(modelPrices.local_vol, 4)}`],
            ['Stochastic vol MC', `$${format(modelPrices.stochastic_vol, 4)}`],
          ]} />
        </div>

        <div className="panel">
          <div className="panel-title">Option Greeks</div>
          <BarChart rows={greekBars} digits={3} />
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
          <div className="panel-title">Stress heatmap and PnL</div>
          <div className="stress-heatmap">
            {stress.map((row) => (
              <div
                key={row.label}
                className="stress-cell"
                style={{ backgroundColor: stressTone(row.pnl, maxStressPnl) }}
              >
                <span>{row.label}</span>
                <strong>{format(row.pnl, 2)}</strong>
              </div>
            ))}
          </div>
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
          <div className="panel-title">Scenario Greeks matrix</div>
          <table className="data-table">
            <thead><tr><th>Scenario</th><th>Delta</th><th>Gamma</th><th>Vega</th><th>Theta</th><th>Rho</th></tr></thead>
            <tbody>
              {scenarioGreekRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{format(row.delta, 3)}</td>
                  <td>{format(row.gamma, 4)}</td>
                  <td>{format(row.vega, 3)}</td>
                  <td>{format(row.theta, 3)}</td>
                  <td>{format(row.rho, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel wide">
          <div className="panel-title">Vol smile and term structure</div>
          <div className="chart-pair">
            <MiniLine title="Smile" xLabel="Strike" values={smile.map((point) => point.implied_vol)} labels={smile.map((point) => format(point.strike, 0))} />
            <MiniLine title="Term" xLabel="Expiry" values={termStructure.map((point) => point.implied_vol)} labels={termStructure.map((point) => format(point.expiry, 2))} />
          </div>
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

function BarChart({ rows, valuePrefix = '', digits = 2 }: { rows: Array<[string, number]>; valuePrefix?: string; digits?: number }) {
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

function MiniLine({ title, xLabel, values, labels }: { title: string; xLabel: string; values: number[]; labels: string[] }) {
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

function PayoffChart({
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
  const markerRows: Array<[string, number, string]> = [
    ['Spot', spot, `$${format(spot, 2)}`],
    ['Strike', strike, `$${format(strike, 2)}`],
    ['B/E', breakeven, `$${format(breakeven, 2)}`],
  ]

  return (
    <div className="payoff-wrap">
      <div className="payoff-head">
        <span>Expiration payoff and profit</span>
        <span>{kind === 'call' ? 'Long call' : 'Long put'} using current model premium</span>
      </div>
      <svg viewBox="0 0 100 100" className="payoff-chart" role="img" aria-label="Option payoff and profit at expiration">
        <line x1="4" x2="98" y1={zeroY} y2={zeroY} className="axis-line" />
        {markerRows.map(([label, value]) => (
          <g key={label}>
            <line x1={xOf(value)} x2={xOf(value)} y1="10" y2="92" className="marker-line" />
          </g>
        ))}
        <polyline points={toPoints(payoff)} className="payoff-line" />
        <polyline points={toPoints(profit)} className="profit-line" />
      </svg>
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
