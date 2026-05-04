import type { FormState, VolMarkSource } from './domainTypes'

export function resolvePricingVol(
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

export function minMax(values: number[]) {
  if (values.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...values), max: Math.max(...values) }
}

export function stressTone(pnl: number, maxAbsPnl: number) {
  const strength = Math.min(1, Math.abs(pnl) / Math.max(maxAbsPnl, 1))
  if (pnl > 0) return `rgba(68, 139, 84, ${0.18 + strength * 0.42})`
  if (pnl < 0) return `rgba(160, 73, 73, ${0.18 + strength * 0.42})`
  return '#20242a'
}

export function moneynessStatus(form: Pick<FormState, 'kind' | 'spot' | 'strike'>) {
  const distance = form.spot - form.strike
  const relativeDistance = Math.abs(distance) / Math.max(form.strike, 1)
  if (relativeDistance <= 0.005) return 'ATM'
  if (form.kind === 'call') return distance > 0 ? 'ITM' : 'OTM'
  return distance < 0 ? 'ITM' : 'OTM'
}

export function surfaceStrikes(spot: number, strike: number) {
  const low = Math.max(0.01, Math.min(spot, strike) * 0.85)
  const high = Math.max(spot, strike) * 1.15
  const step = (high - low) / 4
  return Array.from({ length: 5 }, (_, index) => Number((low + step * index).toFixed(6)))
}

export function surfaceExpiries(expiry: number) {
  return Array.from(new Set([0.25, 0.5, 1, 2, Math.max(0.01, expiry)].map((value) => Number(value.toFixed(6)))))
    .sort((left, right) => left - right)
}
