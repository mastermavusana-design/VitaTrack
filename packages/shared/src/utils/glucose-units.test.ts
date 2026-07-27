import { describe, it, expect } from 'vitest'
import {
  mmolToMgdl,
  mgdlToMmol,
  convertGlucose,
  classifyGlucose,
  formatGlucose,
} from './glucose-units'

describe('glucose unit conversion', () => {
  it('mmol/L → mg/dL rounds to nearest integer', () => {
    expect(mmolToMgdl(5.5)).toBe(99) // 5.5 * 18.0182 = 99.1
    expect(mmolToMgdl(10)).toBe(180)
  })

  it('mg/dL → mmol/L rounds to one decimal', () => {
    expect(mgdlToMmol(100)).toBe(5.5)
    expect(mgdlToMmol(180)).toBe(10)
  })

  it('round-trips within one-decimal tolerance', () => {
    const back = mgdlToMmol(mmolToMgdl(7.0))
    expect(back).toBeCloseTo(7.0, 1)
  })

  it('convertGlucose is identity when units match', () => {
    expect(convertGlucose(5.5, 'mmol/L', 'mmol/L')).toBe(5.5)
    expect(convertGlucose(100, 'mg/dL', 'mg/dL')).toBe(100)
  })

  it('convertGlucose switches units correctly', () => {
    expect(convertGlucose(5.5, 'mmol/L', 'mg/dL')).toBe(99)
    expect(convertGlucose(99, 'mg/dL', 'mmol/L')).toBe(5.5)
  })
})

describe('classifyGlucose (fasting)', () => {
  it('flags low (< 3.9) as urgent', () => {
    const r = classifyGlucose(3.5, 'fasting')
    expect(r.category).toBe('low')
    expect(r.urgent).toBe(true)
  })

  it('classifies normal (≤ 5.6)', () => {
    expect(classifyGlucose(5.0).category).toBe('normal')
    expect(classifyGlucose(5.6).category).toBe('normal')
  })

  it('classifies pre-diabetic (5.6–7.0)', () => {
    expect(classifyGlucose(6.5).category).toBe('pre_diabetic')
    expect(classifyGlucose(7.0).category).toBe('pre_diabetic')
  })

  it('classifies diabetic (7.0–16.7)', () => {
    expect(classifyGlucose(9.0).category).toBe('diabetic')
    expect(classifyGlucose(16.7).category).toBe('diabetic')
  })

  it('flags very high (> 16.7) as urgent', () => {
    const r = classifyGlucose(20)
    expect(r.category).toBe('very_high')
    expect(r.urgent).toBe(true)
  })

  it('defaults to fasting context', () => {
    expect(classifyGlucose(6.0)).toEqual(classifyGlucose(6.0, 'fasting'))
  })
})

describe('classifyGlucose (post-meal thresholds differ)', () => {
  it('6.0 is normal after a meal but pre-diabetic fasting', () => {
    expect(classifyGlucose(6.0, 'after_meal').category).toBe('normal')
    expect(classifyGlucose(6.0, 'fasting').category).toBe('pre_diabetic')
  })
})

describe('formatGlucose', () => {
  it('formats mmol/L with one decimal', () => {
    expect(formatGlucose(5.5, 'mmol/L')).toBe('5.5 mmol/L')
  })
  it('formats mg/dL as a rounded integer', () => {
    expect(formatGlucose(99.4, 'mg/dL')).toBe('99 mg/dL')
  })
})
