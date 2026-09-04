import { describe, expect, it } from 'vitest'
import { format, optionalMoney, optionalPercent, percent } from './formatters'

describe('formatters', () => {
  it('formats finite values with stable rounded zero handling', () => {
    expect(format(1.23456, 2)).toBe('1.23')
    expect(format(-0.00001, 2)).toBe('0.00')
  })

  it('renders non-finite and optional values as dashes', () => {
    expect(format(Number.NaN)).toBe('-')
    expect(optionalMoney(undefined)).toBe('-')
    expect(optionalPercent(null)).toBe('-')
  })

  it('formats percentages and currency values', () => {
    expect(percent(0.1234)).toBe('12.34%')
    expect(optionalMoney(10.456)).toBe('$10.46')
    expect(optionalPercent(0.0789, 1)).toBe('7.9%')
  })
})
