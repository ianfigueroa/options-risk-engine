export type OptionKind = 'call' | 'put'
export type SurfaceSource = 'synthetic' | 'live'
export type VolMarkSource = 'manual' | 'market' | 'chain' | 'surface'
export type TabId = 'risk' | 'surface' | 'hedging' | 'models'

export type FormState = {
  kind: OptionKind
  spot: number
  strike: number
  expiry: number
  rate: number
  volatility: number
}

export type Greeks = {
  delta: number
  gamma: number
  vega: number
  theta: number
  rho: number
}

export type StressRow = {
  label: string
  scenario_value?: number
  pnl: number
}

export type ScenarioGreekRow = Greeks & { label: string }

export type ModelPrices = {
  black_scholes: number
  binomial: number
  monte_carlo: number
  local_vol: number
  stochastic_vol: number
}

export type HedgeResult = {
  terminal_spot: number
  hedging_error: number
  transaction_costs: number
  spot_path: number[]
  delta_path: number[]
}

export type SurfaceResult = {
  source?: string
  interpolated_vol: number
  quote_count: number
  failed_quote_count?: number
  smile: Array<{ strike: number; implied_vol: number }>
  term_structure: Array<{ expiry: number; implied_vol: number }>
  suspicious_quotes: unknown[]
  arbitrage_warnings: string[]
}

export type MarketSnapshot = {
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

export type LiveOptionQuote = {
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
