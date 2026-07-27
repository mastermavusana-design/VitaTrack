import { describe, it, expect } from 'vitest'
import {
  classifyBP,
  meanArterialPressure,
  pulsePressure,
} from './bp-classification'

describe('classifyBP', () => {
  it('returns null for physiologically impossible readings', () => {
    expect(classifyBP(39, 80)).toBeNull()   // systolic too low
    expect(classifyBP(301, 80)).toBeNull()  // systolic too high
    expect(classifyBP(120, 19)).toBeNull()  // diastolic too low
    expect(classifyBP(120, 201)).toBeNull() // diastolic too high
  })

  it('classifies hypotension (< 90/60)', () => {
    expect(classifyBP(85, 55)?.category).toBe('hypotension')
    expect(classifyBP(110, 55)?.category).toBe('hypotension') // low diastolic alone
    expect(classifyBP(85, 70)?.category).toBe('hypotension')  // low systolic alone
  })

  it('classifies optimal (< 120/80)', () => {
    expect(classifyBP(115, 75)?.category).toBe('optimal')
    expect(classifyBP(90, 60)?.category).toBe('optimal') // lower boundary of non-hypotensive
  })

  it('classifies normal (120–129 / 80–84)', () => {
    expect(classifyBP(120, 78)?.category).toBe('normal')
    expect(classifyBP(125, 82)?.category).toBe('normal')
  })

  it('classifies high normal (130–139 / 85–89)', () => {
    expect(classifyBP(135, 88)?.category).toBe('high_normal')
    expect(classifyBP(118, 85)?.category).toBe('high_normal') // diastolic drives it
  })

  it('classifies stage 1 (140–159 / 90–99)', () => {
    expect(classifyBP(145, 92)?.category).toBe('stage1')
  })

  it('classifies isolated systolic hypertension (≥140 sys, <90 dia)', () => {
    const r = classifyBP(150, 85)
    expect(r?.category).toBe('isolated_sys')
    expect(r?.urgent).toBe(false)
  })

  it('classifies stage 2 (160–179 / 100–109)', () => {
    const r = classifyBP(165, 105)
    expect(r?.category).toBe('stage2')
    expect(r?.urgent).toBe(true)
  })

  it('classifies stage 3 / crisis (≥180 / ≥110)', () => {
    const r = classifyBP(185, 115)
    expect(r?.category).toBe('stage3')
    expect(r?.urgent).toBe(true)
    expect(classifyBP(120, 112)?.category).toBe('stage3') // diastolic alone
  })

  it('exact boundary values land in the higher band', () => {
    expect(classifyBP(120, 80)?.category).toBe('normal')
    expect(classifyBP(130, 85)?.category).toBe('high_normal')
    expect(classifyBP(140, 90)?.category).toBe('stage1')
    expect(classifyBP(160, 100)?.category).toBe('stage2')
    expect(classifyBP(180, 110)?.category).toBe('stage3')
  })

  it('every classification carries display metadata', () => {
    const r = classifyBP(145, 92)!
    expect(r.label).toBeTruthy()
    expect(r.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(r.bgColor).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('meanArterialPressure', () => {
  it('computes MAP = diastolic + (systolic - diastolic)/3, rounded', () => {
    expect(meanArterialPressure(120, 80)).toBe(93) // 80 + 40/3 = 93.33
    expect(meanArterialPressure(140, 90)).toBe(107) // 90 + 50/3 = 106.67
  })
})

describe('pulsePressure', () => {
  it('computes systolic - diastolic', () => {
    expect(pulsePressure(120, 80)).toBe(40)
    expect(pulsePressure(160, 100)).toBe(60)
  })
})
