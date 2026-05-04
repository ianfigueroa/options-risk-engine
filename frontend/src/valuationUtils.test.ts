import { describe, expect, it } from 'vitest'
import {
  minMax,
  moneynessStatus,
  resolvePricingVol,
  stressTone,
  surfaceExpiries,
  surfaceStrikes,
} from './valuationUtils'

describe('valuation utilities', () => {
  it('chooses a valid pricing volatility and falls back to manual volatility', () => {
    const values = { manual: 0.2, market: 0.25, chain: null, surface: Number.NaN }

    expect(resolvePricingVol('market', values)).toBe(0.25)
    expect(resolvePricingVol('chain', values)).toBe(0.2)
    expect(resolvePricingVol('surface', values)).toBe(0.2)
  })

  it('calculates range and moneyness labels', () => {
    expect(minMax([3, -1, 10])).toEqual({ min: -1, max: 10 })
    expect(minMax([])).toEqual({ min: 0, max: 0 })
    expect(moneynessStatus({ kind: 'call', spot: 101, strike: 100 })).toBe('ITM')
    expect(moneynessStatus({ kind: 'put', spot: 101, strike: 100 })).toBe('OTM')
    expect(moneynessStatus({ kind: 'call', spot: 100.2, strike: 100 })).toBe('ATM')
  })

  it('builds stable surface query grids around spot and selected strike', () => {
    expect(surfaceStrikes(100, 110)).toEqual([85, 95.375, 105.75, 116.125, 126.5])
    expect(surfaceExpiries(0.75)).toEqual([0.25, 0.5, 0.75, 1, 2])
    expect(surfaceExpiries(0.5)).toEqual([0.25, 0.5, 1, 2])
  })

  it('maps stress PnL into stable heatmap tones', () => {
    expect(stressTone(10, 20)).toBe('rgba(68, 139, 84, 0.39)')
    expect(stressTone(-10, 20)).toBe('rgba(160, 73, 73, 0.39)')
    expect(stressTone(0, 20)).toBe('#20242a')
  })
})
