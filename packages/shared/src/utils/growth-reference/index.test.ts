import { describe, it, expect } from 'vitest'
import {
  getLMSTable,
  availableIndicators,
  zScoreFor,
  percentileFor,
  classifyFor,
  ageInDays,
  WHO_GOLDEN,
} from './index'

describe('WHO reference data integrity', () => {
  it('exposes all seven RtHB indicators for both sexes', () => {
    const inds = availableIndicators().sort()
    expect(inds).toEqual(['acfa', 'bmifa', 'hcfa', 'lhfa', 'wfa', 'wfh', 'wfl'])
    for (const ind of inds) {
      expect(getLMSTable(ind, 'male')).not.toBeNull()
      expect(getLMSTable(ind, 'female')).not.toBeNull()
    }
  })

  it('carries the canonical WHO birth medians (weight-for-age, day 0)', () => {
    // Well-known WHO 2006 values: boys 3.3464 kg, girls 3.2322 kg at birth.
    expect(getLMSTable('wfa', 'male')!.points[0]).toMatchObject({ x: 0, M: 3.3464 })
    expect(getLMSTable('wfa', 'female')!.points[0]).toMatchObject({ x: 0, M: 3.2322 })
  })

  it('tables are sorted ascending by x and non-empty', () => {
    for (const ind of availableIndicators()) {
      for (const sex of ['male', 'female'] as const) {
        const pts = getLMSTable(ind, sex)!.points
        expect(pts.length).toBeGreaterThan(0)
        for (let i = 1; i < pts.length; i++) {
          expect(pts[i].x).toBeGreaterThan(pts[i - 1].x)
        }
      }
    }
  })

  it('uses cm for weight-for-length/height and days for age indicators', () => {
    expect(getLMSTable('wfl', 'male')!.unitX).toBe('cm')
    expect(getLMSTable('wfh', 'female')!.unitX).toBe('cm')
    expect(getLMSTable('wfa', 'male')!.unitX).toBe('day')
  })
})

describe('golden cross-check against the WHO source', () => {
  it('reproduces every golden z-score within tolerance', () => {
    for (const g of WHO_GOLDEN) {
      const z = zScoreFor(g.indicator, g.sex, g.x, g.value)
      expect(z).not.toBeNull()
      expect(z!).toBeCloseTo(g.z, 4)
    }
  })
})

describe('zScoreFor / percentileFor / classifyFor', () => {
  it('places the median at z≈0 and the 50th percentile', () => {
    const wfa = getLMSTable('wfa', 'male')!
    const p = wfa.points[12] // ~12 months
    expect(zScoreFor('wfa', 'male', p.x, p.M)!).toBeCloseTo(0, 6)
    expect(percentileFor('wfa', 'male', p.x, p.M)!).toBeCloseTo(50, 6)
  })

  it('flags a severely underweight child as urgent', () => {
    const wfa = getLMSTable('wfa', 'female')!
    const p = wfa.points[24] // ~24 months
    const c = classifyFor('wfa', 'female', p.x, p.M * 0.6)! // far below median
    expect(c.band).toBe('severe_low')
    expect(c.urgent).toBe(true)
    expect(c.label).toMatch(/underweight/i)
  })

  it('returns null for an indicator with no reference table', () => {
    // 'ssfa' (skinfold) is intentionally not shipped.
    expect(zScoreFor('wfa'.replace('wfa', 'ssfa') as never, 'male', 100, 10)).toBeNull()
  })
})

describe('ageInDays', () => {
  it('counts whole days between ISO dates', () => {
    expect(ageInDays('2024-01-01', '2024-01-01')).toBe(0)
    expect(ageInDays('2024-01-01', '2024-02-01')).toBe(31)
    expect(ageInDays('2020-01-01', '2020-07-01')).toBe(182) // leap year
  })
})
