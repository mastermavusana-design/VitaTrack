import { describe, it, expect } from 'vitest'
import {
  isISODate,
  isSex,
  isImmunisationStatus,
  isChildRecordSource,
  isMilestoneDomain,
  isMilestoneStatus,
  validateDependant,
  validateImmunisation,
  validateGrowthMeasurement,
  validateMilestone,
} from './child-health'

// A safely-in-the-past date for "given/measured" fields.
const PAST = '2020-01-15'
const FUTURE = '2999-01-01'

describe('isISODate', () => {
  it('accepts real calendar dates', () => {
    expect(isISODate('2024-02-29')).toBe(true) // leap year
    expect(isISODate(PAST)).toBe(true)
  })
  it('rejects malformed or impossible dates', () => {
    expect(isISODate('2023-02-29')).toBe(false) // not a leap year
    expect(isISODate('2024-13-01')).toBe(false)
    expect(isISODate('15/01/2020')).toBe(false)
    expect(isISODate(20200115)).toBe(false)
    expect(isISODate(null)).toBe(false)
  })
})

describe('enum guards', () => {
  it('validate against the DB CHECK values', () => {
    expect(isSex('male')).toBe(true)
    expect(isSex('other')).toBe(false)
    expect(isImmunisationStatus('contraindicated')).toBe(true)
    expect(isImmunisationStatus('done')).toBe(false)
    expect(isChildRecordSource('scan')).toBe(true)
    expect(isChildRecordSource('api')).toBe(false)
    expect(isMilestoneDomain('cognitive')).toBe(true)
    expect(isMilestoneDomain('emotional')).toBe(false)
    expect(isMilestoneStatus('concern')).toBe(true)
    expect(isMilestoneStatus('maybe')).toBe(false)
  })
})

describe('validateDependant', () => {
  const valid = { full_name: 'Thandi M', date_of_birth: PAST, sex: 'female', popia_consent: true }

  it('accepts a valid dependant', () => {
    expect(validateDependant(valid).ok).toBe(true)
  })
  it('requires a name', () => {
    expect(validateDependant({ ...valid, full_name: '   ' })).toMatchObject({ ok: false })
  })
  it('requires a valid, non-future DOB', () => {
    expect(validateDependant({ ...valid, date_of_birth: 'nope' }).ok).toBe(false)
    expect(validateDependant({ ...valid, date_of_birth: FUTURE }).ok).toBe(false)
  })
  it('rejects an invalid sex but allows null', () => {
    expect(validateDependant({ ...valid, sex: 'x' }).ok).toBe(false)
    expect(validateDependant({ ...valid, sex: null }).ok).toBe(true)
  })
  it('range-checks birth weight and gestational age', () => {
    expect(validateDependant({ ...valid, birth_weight_g: 50 }).ok).toBe(false)
    expect(validateDependant({ ...valid, birth_weight_g: 3200 }).ok).toBe(true)
    expect(validateDependant({ ...valid, gestational_age_wk: 10 }).ok).toBe(false)
  })
  it('requires POPIA consent', () => {
    const r = validateDependant({ ...valid, popia_consent: false })
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toMatch(/popia/i)
  })
})

describe('validateImmunisation', () => {
  const base = { vaccine_code: 'BCG', vaccine_name: 'Bacillus Calmette-Guérin' }

  it('accepts a due dose with no dates', () => {
    expect(validateImmunisation({ ...base, status: 'due' }).ok).toBe(true)
  })
  it('defaults status/source when omitted', () => {
    expect(validateImmunisation(base).ok).toBe(true)
  })
  it('requires code and name', () => {
    expect(validateImmunisation({ vaccine_name: 'x' }).ok).toBe(false)
    expect(validateImmunisation({ vaccine_code: 'x' }).ok).toBe(false)
  })
  it("requires a non-future given_date when status is 'given'", () => {
    expect(validateImmunisation({ ...base, status: 'given' }).ok).toBe(false)
    expect(validateImmunisation({ ...base, status: 'given', given_date: PAST }).ok).toBe(true)
    expect(validateImmunisation({ ...base, status: 'given', given_date: FUTURE }).ok).toBe(false)
  })
  it('rejects unknown status/source', () => {
    expect(validateImmunisation({ ...base, status: 'done' }).ok).toBe(false)
    expect(validateImmunisation({ ...base, source: 'api' }).ok).toBe(false)
  })
})

describe('validateGrowthMeasurement', () => {
  it('accepts a single valid metric', () => {
    expect(validateGrowthMeasurement({ measured_at: PAST, weight_kg: 8.5 }).ok).toBe(true)
  })
  it('requires at least one metric', () => {
    const r = validateGrowthMeasurement({ measured_at: PAST })
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toMatch(/at least one/i)
  })
  it('range-checks each metric', () => {
    expect(validateGrowthMeasurement({ measured_at: PAST, weight_kg: 500 }).ok).toBe(false)
    expect(validateGrowthMeasurement({ measured_at: PAST, head_circ_cm: 5 }).ok).toBe(false)
    expect(validateGrowthMeasurement({ measured_at: PAST, muac_cm: 12 }).ok).toBe(true)
  })
  it('requires a valid, non-future measured_at', () => {
    expect(validateGrowthMeasurement({ measured_at: FUTURE, weight_kg: 8 }).ok).toBe(false)
    expect(validateGrowthMeasurement({ measured_at: 'bad', weight_kg: 8 }).ok).toBe(false)
  })
})

describe('validateMilestone', () => {
  it('accepts a minimal valid milestone', () => {
    expect(validateMilestone({ milestone: 'Sits without support' }).ok).toBe(true)
  })
  it('requires a milestone description', () => {
    expect(validateMilestone({ milestone: '  ' }).ok).toBe(false)
  })
  it('validates domain and status enums', () => {
    expect(validateMilestone({ milestone: 'Walks', domain: 'motor', status: 'achieved', achieved_on: PAST }).ok).toBe(true)
    expect(validateMilestone({ milestone: 'Walks', domain: 'emotional' }).ok).toBe(false)
    expect(validateMilestone({ milestone: 'Walks', status: 'maybe' }).ok).toBe(false)
  })
  it('rejects a future achieved_on', () => {
    expect(validateMilestone({ milestone: 'Walks', status: 'achieved', achieved_on: FUTURE }).ok).toBe(false)
  })
})
