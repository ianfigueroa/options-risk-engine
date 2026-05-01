import { Play, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AnalyticsTabs } from './AnalyticsTabs'
import { OptionChainTable, PayoffChart, type OptionChainLadderRow } from './components'
import type {
  FormState,
  Greeks,
  HedgeResult,
  LiveOptionQuote,
  MarketSnapshot,
  ModelPrices,
  OptionKind,
  ScenarioGreekRow,
  StressRow,
  SurfaceResult,
  SurfaceSource,
  TabId,
  VolMarkSource,
} from './domainTypes'
import { format, optionalMoney, optionalPercent, percent } from './formatters'
import { presetStrike, yearsUntilExpiration } from './marketUtils'

type OptionChainResponse = {
  source: string
  ticker: string
  expiration: string
  expiry_years: number
  quote_count: number
  rows: OptionChainLadderRow[]
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

function optionMarketPayload(form: FormState, volatility = form.volatility) {
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
      volatility,
    },
  }
}

function resolvePricingVol(
  source: VolMarkSource,
  values: { manual: number; market: number; chain?: number | null; surface: number },
) {
  const candidates: Record<VolMarkSource, number | null | undefined> = {
    manual: values.manual,
    market: values.market,
    chain: values.chain,
    surface: values.surface,
  }
  const selected = candidates[source]
  return typeof selected === 'number' && Number.isFinite(selected) && selected >= 0 ? selected : values.manual
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

function moneynessStatus(form: FormState) {
  const distance = form.spot - form.strike
  const relativeDistance = Math.abs(distance) / Math.max(form.strike, 1)
  if (relativeDistance <= 0.005) return 'ATM'
  if (form.kind === 'call') return distance > 0 ? 'ITM' : 'OTM'
  return distance < 0 ? 'ITM' : 'OTM'
}

function surfaceStrikes(spot: number, strike: number) {
  const low = Math.max(0.01, Math.min(spot, strike) * 0.85)
  const high = Math.max(spot, strike) * 1.15
  const step = (high - low) / 4
  return Array.from({ length: 5 }, (_, index) => Number((low + step * index).toFixed(6)))
}

function surfaceExpiries(expiry: number) {
  return Array.from(new Set([0.25, 0.5, 1, 2, Math.max(0.01, expiry)].map((value) => Number(value.toFixed(6)))))
    .sort((left, right) => left - right)
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
  const [failedQuoteCount, setFailedQuoteCount] = useState(0)
  const [surfaceWarnings, setSurfaceWarnings] = useState(0)
  const [smile, setSmile] = useState<SurfaceResult['smile']>([])
  const [termStructure, setTermStructure] = useState<SurfaceResult['term_structure']>([])
  const [surfaceSource, setSurfaceSource] = useState<SurfaceSource>('synthetic')
  const [volMarkSource, setVolMarkSource] = useState<VolMarkSource>('manual')
  const [pricingVol, setPricingVol] = useState(form.volatility)
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null)
  const [liveOptionQuote, setLiveOptionQuote] = useState<LiveOptionQuote | null>(null)
  const [optionChainRows, setOptionChainRows] = useState<OptionChainLadderRow[]>([])
  const [optionChainExpiration, setOptionChainExpiration] = useState<string | null>(null)
  const [optionChainExpiry, setOptionChainExpiry] = useState<number | null>(null)
  const [status, setStatus] = useState('API idle')
  const [surfaceStatus, setSurfaceStatus] = useState('Surface idle')
  const [marketStatus, setMarketStatus] = useState('Market data idle')
  const [optionChainStatus, setOptionChainStatus] = useState('Chain idle')
  const [loading, setLoading] = useState(false)
  const [marketLoading, setMarketLoading] = useState(false)
  const [chainLoading, setChainLoading] = useState(false)
  const [liveRefreshEnabled, setLiveRefreshEnabled] = useState(false)
  const [lastLiveRefresh, setLastLiveRefresh] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('risk')

  const runAnalytics = useCallback(async () => {
    setLoading(true)
    setStatus('Running analytics')
    try {
      let nextSurfaceVol = Number.NaN
      try {
        const surfaceResponse = surfaceSource === 'live'
          ? await getJson<SurfaceResult>(`/live-vol-surface/${encodeURIComponent(ticker)}?${new URLSearchParams({
            kind: form.kind,
            spot: String(form.spot),
            rate: String(form.rate),
            dividend_yield: '0',
            query_strike: String(form.strike),
            query_expiry: String(form.expiry),
            max_expirations: '4',
            strike_window: '0.35',
          })}`)
          : await postJson<SurfaceResult>('/vol-surface', {
            spot: form.spot,
            expiries: surfaceExpiries(form.expiry),
            strikes: surfaceStrikes(form.spot, form.strike),
            query_strike: form.strike,
            query_expiry: form.expiry,
          })
        nextSurfaceVol = surfaceResponse.interpolated_vol
        setSurfaceVol(surfaceResponse.interpolated_vol)
        setQuoteCount(surfaceResponse.quote_count)
        setFailedQuoteCount(surfaceResponse.failed_quote_count ?? 0)
        setSurfaceWarnings(surfaceResponse.suspicious_quotes.length + surfaceResponse.arbitrage_warnings.length)
        setSmile(surfaceResponse.smile)
        setTermStructure(surfaceResponse.term_structure)
        setSurfaceStatus(surfaceResponse.source ?? (surfaceSource === 'live' ? 'Live option chain' : 'Synthetic surface'))
      } catch (error) {
        setSurfaceStatus(error instanceof Error ? error.message : 'Surface unavailable')
      }

      const seedPayload = optionMarketPayload(form)
      const manualIvResponse = await postJson<{ implied_volatility: number }>('/implied-vol', {
        ...seedPayload,
        option_price: marketPrice,
      }).catch(() => ({ implied_volatility: Number.NaN }))
      const selectedVol = resolvePricingVol(volMarkSource, {
        manual: form.volatility,
        market: manualIvResponse.implied_volatility,
        chain: liveOptionQuote?.implied_volatility,
        surface: nextSurfaceVol,
      })
      const basePayload = optionMarketPayload(form, selectedVol)
      const priceResponse = await postJson<{ price: number }>('/price', basePayload)
      const greeksResponse = await postJson<Greeks>('/greeks', basePayload)
      const ivResponse = await postJson<{ implied_volatility: number }>('/implied-vol', {
        ...basePayload,
        option_price: priceResponse.price,
      })
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

      setPrice(priceResponse.price)
      setGreeks(greeksResponse)
      setIv(ivResponse.implied_volatility)
      setManualIv(manualIvResponse.implied_volatility)
      setPricingVol(selectedVol)
      setModelPrices(modelResponse)
      setPortfolioValue(portfolioResponse.value)
      setPortfolioGreeks(portfolioResponse.greeks)
      setStress(stressResponse.scenarios)
      setScenarioGreekRows(scenarioGreeksResponse.scenarios)
      setHedge(hedgeResponse)
      setStatus('API live')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'API unavailable')
    } finally {
      setLoading(false)
    }
  }, [form, liveOptionQuote?.implied_volatility, marketPrice, surfaceSource, ticker, volMarkSource])

  useEffect(() => {
    void runAnalytics()
  }, [runAnalytics])

  const loadOptionChain = useCallback(async (
    symbol = ticker.trim().toUpperCase(),
    spot = form.spot,
    kind = form.kind,
    expiry = form.expiry,
  ) => {
    if (!symbol) return
    setChainLoading(true)
    setOptionChainStatus('Loading chain')
    try {
      const query = new URLSearchParams({
        spot: String(spot),
        expiry_years: String(expiry),
        strike_window: '0.20',
      })
      const chain = await getJson<OptionChainResponse>(`/option-chain-ladder/${encodeURIComponent(symbol)}?${query}`)
      setOptionChainRows(chain.rows)
      setOptionChainExpiration(chain.expiration)
      setOptionChainExpiry(chain.expiry_years)
      setOptionChainStatus(`${chain.quote_count} strikes / ${chain.expiration}`)
    } catch (error) {
      setOptionChainRows([])
      setOptionChainExpiration(null)
      setOptionChainExpiry(null)
      setOptionChainStatus(error instanceof Error ? error.message : 'Chain unavailable')
    } finally {
      setChainLoading(false)
    }
  }, [form.expiry, form.kind, form.spot, ticker])

  useEffect(() => {
    if (!liveOptionQuote) return
    const quoteExpiry = yearsUntilExpiration(liveOptionQuote.expiration)
    const strikeMatches = Math.abs(liveOptionQuote.matched_strike - form.strike) < 0.001
    const expiryMatches = quoteExpiry !== null && Math.abs(quoteExpiry - form.expiry) < 3 / 365
    if (liveOptionQuote.kind !== form.kind || !strikeMatches || !expiryMatches) {
      setLiveOptionQuote(null)
      setMarketStatus('Contract changed; reload market quote')
    }
  }, [form.expiry, form.kind, form.strike, liveOptionQuote])

  const loadMarketSnapshot = useCallback(async () => {
    const symbol = ticker.trim().toUpperCase()
    if (!symbol) return
    setMarketLoading(true)
    setMarketStatus('Loading quote')
    try {
      const snapshot = await getJson<MarketSnapshot>(`/market-snapshots/${encodeURIComponent(symbol)}`)
      setMarketSnapshot(snapshot)
      setTicker(snapshot.ticker)
      const liveSpot = Number(snapshot.price.toFixed(4))
      const query = new URLSearchParams({
        kind: form.kind,
        strike: String(form.strike),
        expiry_years: String(form.expiry),
      })
      try {
        const quote = await getJson<LiveOptionQuote>(`/option-quotes/${encodeURIComponent(symbol)}?${query}`)
        const livePrice = quote.mid ?? quote.last_price
        const liveExpiry = yearsUntilExpiration(quote.expiration)
        setLiveOptionQuote(quote)
        if (livePrice !== null) setMarketPrice(Number(livePrice.toFixed(4)))
        setForm((current) => ({
          ...current,
          spot: liveSpot,
          strike: Number(quote.matched_strike.toFixed(4)),
          expiry: liveExpiry === null ? current.expiry : Number(liveExpiry.toFixed(6)),
        }))
        await loadOptionChain(symbol, liveSpot, form.kind, liveExpiry ?? form.expiry)
        setMarketStatus(`${snapshot.source} live`)
      } catch (error) {
        setLiveOptionQuote(null)
        setForm((current) => ({ ...current, spot: liveSpot }))
        await loadOptionChain(symbol, liveSpot, form.kind, form.expiry)
        setMarketStatus(error instanceof Error ? `Stock live; ${error.message}` : 'Stock live; option quote unavailable')
      }
    } catch (error) {
      setLiveOptionQuote(null)
      setMarketStatus(error instanceof Error ? error.message : 'Market data unavailable')
    } finally {
      setMarketLoading(false)
    }
  }, [form.expiry, form.kind, form.strike, loadOptionChain, ticker])

  useEffect(() => {
    if (!liveRefreshEnabled) return undefined
    const intervalId = window.setInterval(() => {
      void loadMarketSnapshot().then(() => setLastLiveRefresh(new Date().toLocaleTimeString()))
    }, 120_000)
    return () => window.clearInterval(intervalId)
  }, [liveRefreshEnabled, loadMarketSnapshot])

  const intrinsic =
    form.kind === 'call' ? Math.max(form.spot - form.strike, 0) : Math.max(form.strike - form.spot, 0)
  const timeValue = price - intrinsic
  const forward = form.spot * Math.exp(form.rate * form.expiry)
  const breakeven = form.kind === 'call' ? form.strike + price : form.strike - price
  const marketBreakeven = form.kind === 'call' ? form.strike + marketPrice : form.strike - marketPrice
  const moneyness = form.spot / form.strike
  const statusLabel = moneynessStatus(form)
  const distanceToStrike = Math.abs(form.spot - form.strike)
  const distanceToStrikePct = distanceToStrike / Math.max(form.strike, 1)
  const hedgeRange = minMax(hedge.spot_path)
  const maxStressPnl = Math.max(1, ...stress.map((row) => Math.abs(row.pnl)))
  const greekBars: Array<[string, number]> = Object.entries(greeks).map(([key, value]) => [key, value])
  const theoreticalEdge = price - marketPrice
  const edgePct = marketPrice > 0 ? theoreticalEdge / marketPrice : Number.NaN
  const chainIv = liveOptionQuote?.implied_volatility
  const bidAskSpread =
    liveOptionQuote?.bid !== null && liveOptionQuote?.bid !== undefined &&
      liveOptionQuote?.ask !== null && liveOptionQuote?.ask !== undefined
      ? liveOptionQuote.ask - liveOptionQuote.bid
      : Number.NaN
  const volSpread = Number.isFinite(manualIv) ? manualIv - pricingVol : Number.NaN
  const selectedContractLabel = liveOptionQuote
    ? `${ticker.trim().toUpperCase()} ${liveOptionQuote.expiration} ${liveOptionQuote.kind.toUpperCase()} ${format(liveOptionQuote.matched_strike, 0)}`
    : `${ticker.trim().toUpperCase()} ${form.kind.toUpperCase()} K ${format(form.strike, 2)}`
  function updateTicker(value: string) {
    setTicker(value.toUpperCase())
    setMarketSnapshot(null)
    setLiveOptionQuote(null)
    setOptionChainRows([])
    setOptionChainExpiration(null)
    setOptionChainExpiry(null)
    setOptionChainStatus('Ticker changed; load chain')
    setMarketStatus('Ticker changed; load market')
  }

  function setStrikePreset(preset: 'atm' | 'otm5' | 'otm10' | 'itm5' | 'itm10') {
    setForm((current) => ({
      ...current,
      strike: presetStrike(current.kind, current.spot, preset),
    }))
  }

  function selectOptionChainRow(row: OptionChainLadderRow, kind: OptionKind) {
    const side = kind === 'call' ? row.call : row.put
    if (!side) return
    const livePrice = side.mid ?? side.last_price
    setLiveOptionQuote({
      ticker: ticker.trim().toUpperCase(),
      kind,
      requested_strike: row.strike,
      matched_strike: row.strike,
      expiration: optionChainExpiration ?? '',
      last_price: side.last_price,
      bid: side.bid,
      ask: side.ask,
      mid: side.mid,
      implied_volatility: side.implied_volatility,
      volume: side.volume,
      open_interest: side.open_interest,
      source: 'Yahoo Finance',
    })
    if (livePrice !== null) setMarketPrice(Number(livePrice.toFixed(4)))
    setForm((current) => ({
      ...current,
      kind,
      strike: Number(row.strike.toFixed(4)),
      expiry: optionChainExpiry === null ? current.expiry : Number(optionChainExpiry.toFixed(6)),
    }))
    setMarketStatus(`Selected ${kind.toUpperCase()} ${format(row.strike, 0)}`)
  }

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
    setMarketSnapshot(null)
    setLiveOptionQuote(null)
    setOptionChainRows([])
    setOptionChainExpiration(null)
    setOptionChainExpiry(null)
    setOptionChainStatus('Sample trade loaded')
    setMarketStatus('Sample trade loaded')
  }

  function toggleLiveRefresh() {
    const nextValue = !liveRefreshEnabled
    setLiveRefreshEnabled(nextValue)
    if (nextValue) {
      void loadMarketSnapshot().then(() => setLastLiveRefresh(new Date().toLocaleTimeString()))
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Options Risk Engine</h1>
          <p className="subtitle">Pricing, Greeks, implied volatility, stress testing, and hedging simulation.</p>
        </div>
        <div className="top-actions">
          <button
            className={liveRefreshEnabled ? 'run-button live-active' : 'run-button'}
            onClick={toggleLiveRefresh}
            disabled={marketLoading}
            title="Refresh live market data every two minutes"
          >
            {marketLoading ? <RefreshCw className="spin" size={18} /> : <RefreshCw size={18} />}
            {liveRefreshEnabled ? 'Auto live' : 'Manual'}
          </button>
          <button className="run-button" onClick={runAnalytics} disabled={loading} title="Run analytics from current inputs">
            {loading ? <RefreshCw className="spin" size={18} /> : <Play size={18} />}
            Run
          </button>
        </div>
      </header>

      <section className="ticker-strip">
        <div><span>Selected contract</span><strong>{selectedContractLabel}</strong></div>
        <div><span>Spot</span><strong>{optionalMoney(form.spot)}</strong></div>
        <div><span>Market mid</span><strong>{optionalMoney(marketPrice)}</strong></div>
        <div><span>Theoretical</span><strong>{optionalMoney(price)}</strong></div>
        <div><span>Theo - market</span><strong className={theoreticalEdge >= 0 ? 'positive' : 'negative'}>{format(theoreticalEdge, 2)} / {optionalPercent(edgePct)}</strong></div>
        <div><span>Live refresh</span><strong>{liveRefreshEnabled ? `On${lastLiveRefresh ? `, ${lastLiveRefresh}` : ''}` : 'Off'}</strong></div>
      </section>

      <section className="desk-grid">
        <div className="panel controls trade-ticket">
          <div className="panel-title">Trade setup</div>
          <div className="ticker-control">
            <label>Ticker<input value={ticker} onChange={(event) => updateTicker(event.target.value)} /></label>
            <button className="secondary-button" type="button" onClick={loadMarketSnapshot} disabled={marketLoading}>
              {marketLoading ? 'Loading' : 'Load market'}
            </button>
          </div>
          <label>Type<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OptionKind })}><option value="call">Call</option><option value="put">Put</option></select></label>
          <label>Spot<input type="number" value={form.spot} onChange={(event) => setForm({ ...form, spot: Number(event.target.value) })} /></label>
          <label>Strike<input type="number" value={form.strike} onChange={(event) => setForm({ ...form, strike: Number(event.target.value) })} /></label>
          <div className="strike-presets">
            <button type="button" onClick={() => setStrikePreset('atm')}>ATM</button>
            <button type="button" onClick={() => setStrikePreset('otm5')}>5% OTM</button>
            <button type="button" onClick={() => setStrikePreset('otm10')}>10% OTM</button>
            <button type="button" onClick={() => setStrikePreset('itm5')}>5% ITM</button>
            <button type="button" onClick={() => setStrikePreset('itm10')}>10% ITM</button>
          </div>
          <label>Expiry years<input type="number" step="0.05" value={form.expiry} onChange={(event) => setForm({ ...form, expiry: Number(event.target.value) })} /></label>
          <label>Rate<input type="number" step="0.005" value={form.rate} onChange={(event) => setForm({ ...form, rate: Number(event.target.value) })} /></label>
          <label>Volatility<input type="number" step="0.01" value={form.volatility} onChange={(event) => setForm({ ...form, volatility: Number(event.target.value) })} /></label>
          <label>Market price<input type="number" step="0.01" value={marketPrice} onChange={(event) => setMarketPrice(Number(event.target.value))} /></label>
          <label>Pricing vol mark<select value={volMarkSource} onChange={(event) => setVolMarkSource(event.target.value as VolMarkSource)}>
            <option value="manual">Manual input</option>
            <option value="market">Market IV from price</option>
            <option value="chain">Yahoo chain IV</option>
            <option value="surface">Surface IV</option>
          </select></label>
          <button className="secondary-button" type="button" onClick={loadSampleTrade}>Load sample trade</button>
          <div className="note">Risk uses the selected pricing vol mark: {percent(pricingVol)}. The surface source only drives valuation when this is set to Surface IV.</div>
        </div>

        <div className="panel valuation-panel">
          <div className="panel-title">Option valuation</div>
          <div className="valuation-layout">
            <div>
              <div className="summary-grid valuation-summary">
                <div><span>Theoretical price</span><strong>${format(price, 4)}</strong></div>
                <div><span>Market mid</span><strong>${format(marketPrice, 4)}</strong></div>
                <div><span>Theo - market</span><strong className={theoreticalEdge >= 0 ? 'positive' : 'negative'}>{format(theoreticalEdge, 4)} / {optionalPercent(edgePct)}</strong></div>
                <div><span>Status</span><strong>{statusLabel}</strong></div>
                <div><span>Pricing vol</span><strong>{percent(pricingVol)}</strong></div>
                <div><span>Market IV</span><strong>{optionalPercent(manualIv)}</strong></div>
                <div><span>Intrinsic</span><strong>${format(intrinsic, 4)}</strong></div>
                <div><span>Time value</span><strong>${format(timeValue, 4)}</strong></div>
                <div><span>Moneyness S/K</span><strong>{format(moneyness, 4)}</strong></div>
                <div><span>Distance</span><strong>${format(distanceToStrike, 2)} / {percent(distanceToStrikePct)}</strong></div>
                <div><span>Forward</span><strong>{format(forward, 4)}</strong></div>
                <div><span>Model breakeven</span><strong>{format(breakeven, 4)}</strong></div>
              </div>
              <div className="valuation-foot">
                <span>Market breakeven {format(marketBreakeven, 4)}</span>
                <span>Model IV check {percent(iv)}</span>
                <span>{status}</span>
              </div>
            </div>
            <PayoffChart kind={form.kind} spot={form.spot} strike={form.strike} premium={price} breakeven={breakeven} />
          </div>
        </div>

        <div className="panel market-panel">
          <div className="panel-title">Market quote</div>
          <div className="quote-stack">
            <div><span>Live spot</span><strong>{optionalMoney(marketSnapshot?.price)}</strong></div>
            <div><span>Stock change</span><strong className={(marketSnapshot?.change ?? 0) >= 0 ? 'positive' : 'negative'}>{marketSnapshot?.change === null || marketSnapshot?.change === undefined ? '-' : `${format(marketSnapshot.change, 2)} / ${percent(marketSnapshot.change_percent ?? 0)}`}</strong></div>
            <div><span>Matched contract</span><strong>{liveOptionQuote ? `${liveOptionQuote.expiration} ${liveOptionQuote.kind.toUpperCase()} ${format(liveOptionQuote.matched_strike, 0)}` : '-'}</strong></div>
            <div><span>Bid / ask</span><strong>{optionalMoney(liveOptionQuote?.bid)} / {optionalMoney(liveOptionQuote?.ask)}</strong></div>
            <div><span>Mid / last</span><strong>{optionalMoney(liveOptionQuote?.mid)} / {optionalMoney(liveOptionQuote?.last_price)}</strong></div>
            <div><span>Spread</span><strong>{optionalMoney(bidAskSpread)}</strong></div>
            <div><span>Chain IV</span><strong>{optionalPercent(chainIv)}</strong></div>
            <div><span>Volume / OI</span><strong>{liveOptionQuote ? `${liveOptionQuote.volume ?? '-'} / ${liveOptionQuote.open_interest ?? '-'}` : '-'}</strong></div>
            <div><span>Options dates</span><strong>{marketSnapshot ? marketSnapshot.option_expirations.length : '-'}</strong></div>
            <div><span>Status</span><strong>{marketStatus}</strong></div>
          </div>
        </div>
      </section>

      <section className="workflow-section">
        <div className="panel full-width chain-panel">
          <div className="panel-header">
            <div className="panel-title">Option chain</div>
            <button
              className="small-button"
              type="button"
              onClick={() => loadOptionChain()}
              disabled={chainLoading}
            >
              {chainLoading ? 'Loading' : 'Refresh chain'}
            </button>
          </div>
          <div className="chain-meta">
            <span>{optionChainStatus}</span>
            <span>Calls left / Puts right</span>
          </div>
          <OptionChainTable
            rows={optionChainRows}
            selectedStrike={form.strike}
            selectedKind={form.kind}
            onSelect={selectOptionChainRow}
          />
        </div>

        <div className="panel span-2 vol-panel">
          <div className="panel-title">Volatility mark and surface</div>
          <div className="source-controls">
            <label>Surface source<select value={surfaceSource} onChange={(event) => setSurfaceSource(event.target.value as SurfaceSource)}><option value="synthetic">Synthetic grid</option><option value="live">Live option chain</option></select></label>
            <label>Pricing source<select value={volMarkSource} onChange={(event) => setVolMarkSource(event.target.value as VolMarkSource)}>
              <option value="manual">Manual input</option>
              <option value="market">Market IV from price</option>
              <option value="chain">Yahoo chain IV</option>
              <option value="surface">Surface IV</option>
            </select></label>
          </div>
          <div className="metric-row"><span>Interpolated IV</span><strong>{percent(surfaceVol)}</strong></div>
          <div className="metric-row"><span>Pricing IV used</span><strong>{percent(pricingVol)}</strong></div>
          <div className="metric-row"><span>Market - pricing vol</span><strong>{optionalPercent(volSpread)}</strong></div>
          <div className="metric-row"><span>Chain IV</span><strong>{optionalPercent(chainIv)}</strong></div>
          <div className="metric-row"><span>Query point</span><strong>K {format(form.strike, 2)} / T {format(form.expiry, 2)}</strong></div>
          <div className="metric-row"><span>Quote grid</span><strong>{quoteCount} quotes</strong></div>
          <div className="metric-row"><span>Failed live quotes</span><strong>{surfaceSource === 'live' ? failedQuoteCount : '-'}</strong></div>
          <div className="metric-row"><span>Surface warnings</span><strong>{surfaceWarnings}</strong></div>
          <div className="metric-row"><span>Status</span><strong>{surfaceStatus}</strong></div>
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
          <HedgeChart values={hedge.spot_path} />
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
