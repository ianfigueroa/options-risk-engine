export function format(value: number, digits = 4) {
  if (!Number.isFinite(value)) return '-'
  const roundedZero = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value
  return roundedZero.toFixed(digits)
}

export function percent(value: number, digits = 2) {
  return `${format(value * 100, digits)}%`
}

export function optionalPercent(value: number | null | undefined, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? percent(value, digits) : '-'
}

export function optionalMoney(value: number | null | undefined, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? `$${format(value, digits)}` : '-'
}
