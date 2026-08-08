import { describe, it, expect } from 'vitest'
import { getLMSTable } from './index'
import { percentileToZ, zToMeasurement } from '../growth-lms'

// Validates the exact composition the web GrowthChart uses to draw the WHO
// percentile curves: for each age knot, curve value = zToMeasurement(percentileToZ(pct), lms).

const DAYS_PER_MONTH = 30.4375
const knotAtMonth = (ind: 'wfa' | 'lhfa' | 'hcfa', sex: 'male' | 'female', month: number) => {
  const t = getLMSTable(ind, sex)!
  return t.points.find((p) => Math.round(p.x / DAYS_PER_MONTH) === month)!
}

describe('WHO growth chart reference curves', () => {
  it('boys weight-for-age at 12 months: ordered curves, P50 ≈ WHO median (~9.6 kg)', () => {
    const p = knotAtMonth('wfa', 'male', 12)
    const P = (pct: number) => zToMeasurement(percentileToZ(pct), p)
    expect(P(3)).toBeLessThan(P(50))
    expect(P(50)).toBeLessThan(P(97))
    expect(P(50)).toBeCloseTo(9.6, 0) // WHO boys 12-mo median weight
  })

  it('girls length-for-age at 24 months: P50 ≈ WHO median (~85 cm), curves ordered', () => {
    const p = knotAtMonth('lhfa', 'female', 24)
    const P = (pct: number) => zToMeasurement(percentileToZ(pct), p)
    expect(P(3)).toBeLessThan(P(15))
    expect(P(15)).toBeLessThan(P(85))
    expect(P(85)).toBeLessThan(P(97))
    expect(P(50)).toBeGreaterThan(82)
    expect(P(50)).toBeLessThan(88)
  })

  it('the 50th percentile equals the table median M at a knot', () => {
    const p = knotAtMonth('hcfa', 'male', 6)
    expect(zToMeasurement(percentileToZ(50), p)).toBeCloseTo(p.M, 6)
  })
})
