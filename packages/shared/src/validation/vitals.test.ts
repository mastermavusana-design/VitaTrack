import { describe, it, expect } from 'vitest'
import {
  inRange,
  isFiniteNumber,
  validateBloodPressure,
  validateGlucose,
  validatePulse,
  validateHeartRate,
  validateSpo2,
  validateWeight,
  validateTemperature,
  VITAL_RANGES,
} from './vitals'

describe('isFiniteNumber', () => {
  it('accepts finite numbers only', () => {
    expect(isFiniteNumber(5)).toBe(true)
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
    expect(isFiniteNumber('5')).toBe(false)
    expect(isFiniteNumber(null)).toBe(false)
    expect(isFiniteNumber(undefined)).toBe(false)
  })
})

describe('inRange', () => {
  it('rejects non-numbers with a field-named error', () => {
    const r = inRange('x', { min: 0, max: 10 }, 'foo')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('foo')
  })
  it('accepts inclusive boundaries', () => {
    expect(inRange(0, { min: 0, max: 10 }, 'foo').ok).toBe(true)
    expect(inRange(10, { min: 0, max: 10 }, 'foo').ok).toBe(true)
  })
  it('rejects values outside the range', () => {
    expect(inRange(-1, { min: 0, max: 10 }, 'foo').ok).toBe(false)
    expect(inRange(11, { min: 0, max: 10 }, 'foo').ok).toBe(false)
  })
})

describe('validateBloodPressure', () => {
  it('accepts a normal reading', () => {
    expect(validateBloodPressure(120, 80).ok).toBe(true)
  })
  it('rejects out-of-range systolic/diastolic', () => {
    expect(validateBloodPressure(10, 80).ok).toBe(false)
    expect(validateBloodPressure(120, 5).ok).toBe(false)
  })
  it('requires systolic > diastolic', () => {
    const r = validateBloodPressure(80, 120)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/greater than/)
  })
  it('rejects non-numeric input', () => {
    expect(validateBloodPressure('120', 80).ok).toBe(false)
  })
})

describe('validateGlucose', () => {
  it('accepts a plausible mmol/L value', () => {
    expect(validateGlucose(5.5, 'mmol/L').ok).toBe(true)
  })
  it('accepts a plausible mg/dL value by normalising', () => {
    expect(validateGlucose(100, 'mg/dL').ok).toBe(true)
  })
  it('rejects an implausibly high mg/dL value', () => {
    expect(validateGlucose(5000, 'mg/dL').ok).toBe(false)
  })
  it('defaults to mmol/L', () => {
    expect(validateGlucose(100).ok).toBe(false) // 100 mmol/L is impossible
  })
})

describe('other vital validators', () => {
  it('pulse / heart rate bounds', () => {
    expect(validatePulse(72).ok).toBe(true)
    expect(validateHeartRate(500).ok).toBe(false)
  })
  it('spo2 bounds (50–100)', () => {
    expect(validateSpo2(98).ok).toBe(true)
    expect(validateSpo2(120).ok).toBe(false)
    expect(validateSpo2(40).ok).toBe(false)
  })
  it('weight respects unit', () => {
    expect(validateWeight(70, 'kg').ok).toBe(true)
    expect(validateWeight(70, 'lbs').ok).toBe(true)
    expect(validateWeight(2000, 'lbs').ok).toBe(false)
  })
  it('temperature respects unit', () => {
    expect(validateTemperature(37, '°C').ok).toBe(true)
    expect(validateTemperature(98.6, '°F').ok).toBe(true)
    expect(validateTemperature(50, '°C').ok).toBe(false)
  })
})

describe('VITAL_RANGES', () => {
  it('exposes min < max for every range', () => {
    for (const [, range] of Object.entries(VITAL_RANGES)) {
      expect(range.min).toBeLessThan(range.max)
    }
  })
})
