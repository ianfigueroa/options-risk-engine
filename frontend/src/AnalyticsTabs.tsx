import { BarChart, HedgeChart, MetricTable, MiniLine } from './components'
import type { Greeks, HedgeResult, ModelPrices, ScenarioGreekRow, StressRow, SurfaceResult, SurfaceSource, TabId, VolMarkSource } from './domainTypes'
import { format, optionalPercent, percent } from './formatters'

type Props = {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  greeks: Greeks
  greekBars: Array<[string, number]>
  portfolioValue: number
  portfolioGreeks: Greeks
  stress: StressRow[]
  maxStressPnl: number
  scenarioGreekRows: ScenarioGreekRow[]
  surfaceSource: SurfaceSource
  setSurfaceSource: (source: SurfaceSource) => void
  volMarkSource: VolMarkSource
  setVolMarkSource: (source: VolMarkSource) => void
  surfaceVol: number
  pricingVol: number
  volSpread: number
  chainIv: number | null | undefined
  formStrike: number
  formExpiry: number
  quoteCount: number
  failedQuoteCount: number
  surfaceWarnings: number
  surfaceStatus: string
  smile: SurfaceResult['smile']
  termStructure: SurfaceResult['term_structure']
  hedge: HedgeResult
  hedgeRange: { min: number; max: number }
  modelPrices: ModelPrices
  selectedContractLabel: string
  formSpot: number
  formRate: number
  status: string
  stressTone: (pnl: number, maxAbsPnl: number) => string
}

const tabItems: Array<{ id: TabId; label: string }> = [
  { id: 'risk', label: 'Risk' },
  { id: 'surface', label: 'Vol surface' },
  { id: 'hedging', label: 'Hedging' },
  { id: 'models', label: 'Models' },
]

function modelRows(prices: ModelPrices): Array<[string, number]> {
  return [
    ['Black-Scholes', prices.black_scholes],
    ['Binomial', prices.binomial],
    ['Monte Carlo', prices.monte_carlo],
    ['Local vol', prices.local_vol],
    ['Stochastic vol', prices.stochastic_vol],
  ]
}

export function AnalyticsTabs(props: Props) {
  return (
    <section className="analytics-workspace">
      <nav className="tab-nav" aria-label="Analytics views">
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            className={props.activeTab === tab.id ? 'tab-button active-tab' : 'tab-button'}
            type="button"
            onClick={() => props.setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {props.activeTab === 'risk' && <RiskTab {...props} />}
      {props.activeTab === 'surface' && <SurfaceTab {...props} />}
      {props.activeTab === 'hedging' && <HedgingTab {...props} />}
      {props.activeTab === 'models' && <ModelsTab {...props} />}
    </section>
  )
}

function RiskTab({
  greeks,
  greekBars,
  portfolioValue,
  portfolioGreeks,
  stress,
  maxStressPnl,
  scenarioGreekRows,
  stressTone,
}: Props) {
  return (
    <div className="risk-layout">
      <div className="risk-left">
        <div className="risk-card-grid">
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
        </div>
        <ScenarioGreeksTable rows={scenarioGreekRows} />
      </div>
      <div className="panel risk-stress-panel">
        <div className="panel-title">Stress heatmap and PnL</div>
        <div className="stress-heatmap">
          {stress.map((row) => (
            <div key={row.label} className="stress-cell" style={{ backgroundColor: stressTone(row.pnl, maxStressPnl) }}>
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
    </div>
  )
}

function ScenarioGreeksTable({ rows }: { rows: ScenarioGreekRow[] }) {
  return (
    <div className="panel scenario-panel">
      <div className="panel-title">Scenario Greeks matrix</div>
      <table className="data-table">
        <thead><tr><th>Scenario</th><th>Delta</th><th>Gamma</th><th>Vega</th><th>Theta</th><th>Rho</th></tr></thead>
        <tbody>
          {rows.map((row) => (
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
  )
}

function SurfaceTab(props: Props) {
  return (
    <div className="tab-grid">
      <div className="panel span-2 vol-panel">
        <div className="panel-title">Volatility mark and surface</div>
        <div className="source-controls">
          <label>Surface source<select value={props.surfaceSource} onChange={(event) => props.setSurfaceSource(event.target.value as SurfaceSource)}><option value="synthetic">Synthetic grid</option><option value="live">Live option chain</option></select></label>
          <label>Pricing source<select value={props.volMarkSource} onChange={(event) => props.setVolMarkSource(event.target.value as VolMarkSource)}>
            <option value="manual">Manual input</option>
            <option value="market">Market IV from price</option>
            <option value="chain">Yahoo chain IV</option>
            <option value="surface">Surface IV</option>
          </select></label>
        </div>
        <div className="metric-row"><span>Interpolated IV</span><strong>{percent(props.surfaceVol)}</strong></div>
        <div className="metric-row"><span>Pricing IV used</span><strong>{percent(props.pricingVol)}</strong></div>
        <div className="metric-row"><span>Market - pricing vol</span><strong>{optionalPercent(props.volSpread)}</strong></div>
        <div className="metric-row"><span>Chain IV</span><strong>{optionalPercent(props.chainIv)}</strong></div>
        <div className="metric-row"><span>Query point</span><strong>K {format(props.formStrike, 2)} / T {format(props.formExpiry, 2)}</strong></div>
        <div className="metric-row"><span>Quote grid</span><strong>{props.quoteCount} quotes</strong></div>
        <div className="metric-row"><span>Failed live quotes</span><strong>{props.surfaceSource === 'live' ? props.failedQuoteCount : '-'}</strong></div>
        <div className="metric-row"><span>Surface warnings</span><strong>{props.surfaceWarnings}</strong></div>
        <div className="metric-row"><span>Status</span><strong>{props.surfaceStatus}</strong></div>
      </div>
      <div className="panel span-2">
        <div className="panel-title">Vol smile and term structure</div>
        <div className="chart-pair">
          <MiniLine title="Smile" xLabel="Strike" values={props.smile.map((point) => point.implied_vol)} labels={props.smile.map((point) => format(point.strike, 0))} />
          <MiniLine title="Term" xLabel="Expiry" values={props.termStructure.map((point) => point.implied_vol)} labels={props.termStructure.map((point) => format(point.expiry, 2))} />
        </div>
      </div>
    </div>
  )
}

function HedgingTab({ hedge, hedgeRange }: Props) {
  return (
    <div className="tab-grid">
      <div className="panel span-3">
        <div className="panel-title">Delta hedging path</div>
        <HedgeChart values={hedge.spot_path} />
      </div>
      <div className="panel">
        <div className="panel-title">Hedging summary</div>
        <MetricTable rows={[
          ['Hedging error', format(hedge.hedging_error, 4)],
          ['Transaction costs', format(hedge.transaction_costs, 4)],
          ['Terminal spot', format(hedge.terminal_spot, 4)],
          ['Spot range', `${format(hedgeRange.min, 2)} - ${format(hedgeRange.max, 2)}`],
          ['Rebalance samples', String(hedge.delta_path.length)],
        ]} />
      </div>
    </div>
  )
}

function ModelsTab(props: Props) {
  return (
    <div className="tab-grid">
      <div className="panel span-2">
        <div className="panel-title">Model prices</div>
        <BarChart rows={modelRows(props.modelPrices)} valuePrefix="$" />
        <MetricTable rows={[
          ['Black-Scholes', `$${format(props.modelPrices.black_scholes, 4)}`],
          ['Binomial tree', `$${format(props.modelPrices.binomial, 4)}`],
          ['Monte Carlo', `$${format(props.modelPrices.monte_carlo, 4)}`],
          ['Local vol MC', `$${format(props.modelPrices.local_vol, 4)}`],
          ['Stochastic vol MC', `$${format(props.modelPrices.stochastic_vol, 4)}`],
        ]} />
      </div>
      <div className="panel span-2">
        <div className="panel-title">Current valuation inputs</div>
        <MetricTable rows={[
          ['Contract', props.selectedContractLabel],
          ['Spot / strike', `${format(props.formSpot, 2)} / ${format(props.formStrike, 2)}`],
          ['Expiry / rate', `${format(props.formExpiry, 4)} / ${percent(props.formRate)}`],
          ['Pricing IV', percent(props.pricingVol)],
          ['Surface source', props.surfaceStatus],
          ['API status', props.status],
        ]} />
      </div>
    </div>
  )
}
