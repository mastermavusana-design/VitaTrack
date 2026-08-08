import { describe, it, expect } from 'vitest'
import {
  lmsToZUnadjusted,
  lmsToZ,
  zToMeasurement,
  zToPercentile,
  percentileToZ,
  lmsToPercentile,
  lmsAt,
  zBand,
  classifyGrowthZ,
  type LMS,
  type LMSTable,
} from './growth-lms'

// A skewed LMS triple (L ≠ 0) and a log-normal one (L = 0) for coverage.
const SKEWED: LMS = { L: -0.3521, M: 7.0, S: 0.14 }
const LOGNORMAL: LMS = { L: 0, M: 10, S: 0.12 }

describe('lmsToZ / zToMeasurement (LMS core, |z| ≤ 3)', () => {
  it('the median maps to z = 0 (both L≠0 and L=0)', () => {
    expect(lmsToZUnadjusted(SKEWED.M, SKEWED)).toBeCloseTo(0, 10)
    expect(lmsToZUnadjusted(LOGNORMAL.M, LOGNORMAL)).toBeCloseTo(0, 10)
  })

  it('z = 0 maps back to the median', () => {
    expect(zToMeasurement(0, SKEWED)).toBeCloseTo(SKEWED.M, 10)
    expect(zToMeasurement(0, LOGNORMAL)).toBeCloseTo(LOGNORMAL.M, 10)
  })

  it('round-trips measurement → z → measurement (skewed)', () => {
    for (const z of [-2.5, -1, -0.3, 0.7, 2, 3]) {
      const x = zToMeasurement(z, SKEWED)
      expect(lmsToZUnadjusted(x, SKEWED)).toBeCloseTo(z, 8)
    }
  })

  it('round-trips through the log-normal limit (L = 0)', () => {
    for (const z of [-2, 0, 1.5, 3]) {
      const x = zToMeasurement(z, LOGNORMAL)
      expect(lmsToZUnadjusted(x, LOGNORMAL)).toBeCloseTo(z, 8)
    }
  })

  it('is monotonic increasing in the measurement', () => {
    const zLow = lmsToZ(5.0, SKEWED)
    const zMid = lmsToZ(7.0, SKEWED)
    const zHigh = lmsToZ(9.0, SKEWED)
    expect(zLow).toBeLessThan(zMid)
    expect(zMid).toBeLessThan(zHigh)
  })

  it('returns NaN for non-physiological input', () => {
    expect(lmsToZUnadjusted(0, SKEWED)).toBeNaN()
    expect(lmsToZUnadjusted(-1, SKEWED)).toBeNaN()
  })
})

describe('lmsToZ (WHO extreme-value adjustment)', () => {
  it('is continuous with the raw z-score exactly at z = 3', () => {
    const sd3 = zToMeasurement(3, SKEWED)
    expect(lmsToZ(sd3, SKEWED)).toBeCloseTo(3, 6)
  })

  it('is continuous with the raw z-score exactly at z = -3', () => {
    const sd3neg = zToMeasurement(-3, SKEWED)
    expect(lmsToZ(sd3neg, SKEWED)).toBeCloseTo(-3, 6)
  })

  it('extrapolates linearly in SD-band units above +3', () => {
    // One extra SD-band width beyond SD3 should read as z = 4.
    const sd3 = zToMeasurement(3, SKEWED)
    const sd2 = zToMeasurement(2, SKEWED)
    const oneBandBeyond = sd3 + (sd3 - sd2)
    expect(lmsToZ(oneBandBeyond, SKEWED)).toBeCloseTo(4, 6)
  })

  it('extrapolates linearly below -3', () => {
    const sd3 = zToMeasurement(-3, SKEWED)
    const sd2 = zToMeasurement(-2, SKEWED)
    const oneBandBeyond = sd3 - (sd2 - sd3)
    expect(lmsToZ(oneBandBeyond, SKEWED)).toBeCloseTo(-4, 6)
  })

  it('differs from the raw z-score in the tails', () => {
    const extreme = zToMeasurement(5, SKEWED) // raw z would be 5
    expect(lmsToZ(extreme, SKEWED)).not.toBeCloseTo(5, 2)
  })
})

describe('zToPercentile (standard-normal CDF)', () => {
  it('maps z = 0 to the 50th percentile', () => {
    expect(zToPercentile(0)).toBe(50)
  })

  it('matches known normal quantiles', () => {
    expect(zToPercentile(1.96)).toBeCloseTo(97.5, 1)
    expect(zToPercentile(-1.96)).toBeCloseTo(2.5, 1)
    expect(zToPercentile(1)).toBeCloseTo(84.13, 1)
    expect(zToPercentile(-2)).toBeCloseTo(2.28, 1)
  })

  it('is symmetric about 50', () => {
    for (const z of [0.5, 1.3, 2.7]) {
      expect(zToPercentile(z) + zToPercentile(-z)).toBeCloseTo(100, 4)
    }
  })

  it('is monotonic increasing', () => {
    expect(zToPercentile(-1)).toBeLessThan(zToPercentile(0))
    expect(zToPercentile(0)).toBeLessThan(zToPercentile(1))
  })
})

describe('percentileToZ (inverse CDF)', () => {
  it('maps the 50th percentile to z = 0', () => {
    expect(percentileToZ(50)).toBe(0)
  })

  it('matches known quantiles', () => {
    expect(percentileToZ(97.5)).toBeCloseTo(1.96, 2)
    expect(percentileToZ(2.5)).toBeCloseTo(-1.96, 2)
    expect(percentileToZ(84.13)).toBeCloseTo(1.0, 2)
  })

  it('inverts zToPercentile', () => {
    for (const z of [-2.5, -1, 0.4, 1.8]) {
      expect(percentileToZ(zToPercentile(z))).toBeCloseTo(z, 3)
    }
  })

  it('returns ±Infinity at the bounds', () => {
    expect(percentileToZ(0)).toBe(-Infinity)
    expect(percentileToZ(100)).toBe(Infinity)
  })
})

describe('lmsToPercentile', () => {
  it('places the median at the 50th percentile', () => {
    expect(lmsToPercentile(SKEWED.M, SKEWED)).toBeCloseTo(50, 6)
  })

  it('places the +2SD value near the 97.7th percentile', () => {
    const sd2 = zToMeasurement(2, SKEWED)
    expect(lmsToPercentile(sd2, SKEWED)).toBeCloseTo(97.72, 1)
  })
})

describe('lmsAt (table interpolation)', () => {
  const table: LMSTable = {
    indicator: 'wfa',
    sex: 'male',
    unitX: 'day',
    points: [
      { x: 0, L: 0.3487, M: 3.3464, S: 0.14602 },
      { x: 30, L: 0.2297, M: 4.4709, S: 0.13395 },
      { x: 60, L: 0.197, M: 5.5675, S: 0.12385 },
    ],
  }

  it('returns exact rows at the knots', () => {
    expect(lmsAt(table, 0)).toEqual({ L: 0.3487, M: 3.3464, S: 0.14602 })
    expect(lmsAt(table, 30)).toEqual({ L: 0.2297, M: 4.4709, S: 0.13395 })
  })

  it('linearly interpolates between knots', () => {
    const mid = lmsAt(table, 15)!
    expect(mid.M).toBeCloseTo((3.3464 + 4.4709) / 2, 6)
    expect(mid.L).toBeCloseTo((0.3487 + 0.2297) / 2, 6)
  })

  it('clamps to endpoints outside the range', () => {
    expect(lmsAt(table, -10)).toEqual({ L: 0.3487, M: 3.3464, S: 0.14602 })
    expect(lmsAt(table, 999)).toEqual({ L: 0.197, M: 5.5675, S: 0.12385 })
  })

  it('returns null for an empty table', () => {
    expect(lmsAt({ ...table, points: [] }, 10)).toBeNull()
  })
})

describe('zBand / classifyGrowthZ', () => {
  it('buckets z-scores into the WHO ±2 / ±3 bands', () => {
    expect(zBand(-3.5)).toBe('severe_low')
    expect(zBand(-2.5)).toBe('low')
    expect(zBand(0)).toBe('normal')
    expect(zBand(2)).toBe('normal')
    expect(zBand(2.5)).toBe('high')
    expect(zBand(4)).toBe('severe_high')
  })

  it('flags severe bands as urgent', () => {
    expect(classifyGrowthZ(-3.5, 'wfa').urgent).toBe(true)
    expect(classifyGrowthZ(4, 'wfl').urgent).toBe(true)
    expect(classifyGrowthZ(0, 'wfa').urgent).toBe(false)
  })

  it('uses indicator-specific labels', () => {
    expect(classifyGrowthZ(-3.5, 'lhfa').label).toBe('Severely stunted')
    expect(classifyGrowthZ(-2.5, 'wfa').label).toBe('Underweight')
    expect(classifyGrowthZ(2.5, 'wfl').label).toBe('Overweight')
    expect(classifyGrowthZ(0, 'hcfa').label).toBe('Normal')
  })
})
