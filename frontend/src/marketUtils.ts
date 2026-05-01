type OptionKind = 'call' | 'put'

function strikeStep(spot: number) {
  if (spot >= 250) return 5
  if (spot >= 100) return 2.5
  if (spot >= 25) return 1
  return 0.5
}

function roundedStrike(rawStrike: number, spot: number) {
  const step = strikeStep(spot)
  return Math.max(step, Number((Math.round(rawStrike / step) * step).toFixed(4)))
}

export function presetStrike(kind: OptionKind, spot: number, preset: 'atm' | 'otm5' | 'otm10' | 'itm5' | 'itm10') {
  const direction = kind === 'call' ? 1 : -1
  const multipliers = {
    atm: 1,
    otm5: 1 + direction * 0.05,
    otm10: 1 + direction * 0.10,
    itm5: 1 - direction * 0.05,
    itm10: 1 - direction * 0.10,
  }
  return roundedStrike(spot * multipliers[preset], spot)
}

export function yearsUntilExpiration(expiration: string) {
  const expiryDate = new Date(`${expiration}T00:00:00`)
  if (Number.isNaN(expiryDate.getTime())) return null
  const days = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return Math.max(1 / 365, days / 365)
}
