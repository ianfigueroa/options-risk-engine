import { afterEach, describe, expect, it, vi } from 'vitest'
import { presetStrike, yearsUntilExpiration } from './marketUtils'

describe('market utilities', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rounds strike presets to market-sized increments', () => {
    expect(presetStrike('call', 103, 'atm')).toBe(102.5)
    expect(presetStrike('call', 103, 'otm5')).toBe(107.5)
    expect(presetStrike('put', 103, 'otm5')).toBe(97.5)
    expect(presetStrike('put', 20, 'itm10')).toBe(22)
  })

  it('converts expiration dates into positive year fractions', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'))

    expect(yearsUntilExpiration('2026-05-15')).toBeCloseTo(6.5 / 365)
    expect(yearsUntilExpiration('not-a-date')).toBeNull()
    expect(yearsUntilExpiration('2026-05-01')).toBe(1 / 365)
  })
})
