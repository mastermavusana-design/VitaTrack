// ── Child Health Record validation (Phase 5) ──────────────────
// Physiological range + enum + shape validation for the dependant,
// immunisation, growth-measurement and milestone entities. Mirrors the
// CHECK constraints in 20240728000000_child_health_record.sql so the
// client rejects bad input early; the DB constraints + RLS remain the
// authority. Same hand-rolled ValidationResult style as ./vitals.

import type {
  Sex,
  ImmunisationStatus,
  ChildRecordSource,
  MilestoneDomain,
  MilestoneStatus,
} from '../types'
import {
  type Range,
  type ValidationResult,
  isFiniteNumber,
  inRange,
} from './vitals'

// Re-exported for convenience so callers can import everything child-health
// from one module.
export type { Range, ValidationResult }

const ok: ValidationResult = { ok: true }
const fail = (error: string): ValidationResult => ({ ok: false, error })

// ── Ranges (data-entry sanity, not clinical judgement) ────────
export const CHILD_RANGES = {
  birthWeightG:      { min: 200,  max: 7000 },  // g (extreme preterm ↔ macrosomia)
  gestationalAgeWk:  { min: 20,   max: 45 },    // weeks
  weightKg:          { min: 0.2,  max: 120 },   // kg (0–19y)
  lengthCm:          { min: 15,   max: 220 },   // cm
  headCircCm:        { min: 20,   max: 65 },    // cm
  muacCm:            { min: 5,    max: 40 },    // cm
} as const satisfies Record<string, Range>

// ── Enum guards (mirror the DB CHECK constraints) ─────────────
const SEXES: readonly Sex[] = ['male', 'female']
const IMMUNISATION_STATUSES: readonly ImmunisationStatus[] = ['due', 'given', 'skipped', 'contraindicated']
const SOURCES: readonly ChildRecordSource[] = ['manual', 'scan', 'import']
const MILESTONE_DOMAINS: readonly MilestoneDomain[] = ['motor', 'language', 'social', 'cognitive']
const MILESTONE_STATUSES: readonly MilestoneStatus[] = ['not_yet', 'achieved', 'concern']

export const isSex = (v: unknown): v is Sex => SEXES.includes(v as Sex)
export const isImmunisationStatus = (v: unknown): v is ImmunisationStatus =>
  IMMUNISATION_STATUSES.includes(v as ImmunisationStatus)
export const isChildRecordSource = (v: unknown): v is ChildRecordSource =>
  SOURCES.includes(v as ChildRecordSource)
export const isMilestoneDomain = (v: unknown): v is MilestoneDomain =>
  MILESTONE_DOMAINS.includes(v as MilestoneDomain)
export const isMilestoneStatus = (v: unknown): v is MilestoneStatus =>
  MILESTONE_STATUSES.includes(v as MilestoneStatus)

// ── Date helpers ──────────────────────────────────────────────
/** True for a 'YYYY-MM-DD' string that parses to a real calendar date. */
export function isISODate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** True when the ISO date is today or earlier (UTC). */
function isNotFuture(iso: string): boolean {
  return iso <= new Date().toISOString().slice(0, 10)
}

// ── Dependant ─────────────────────────────────────────────────
export type DependantInput = {
  full_name?: unknown
  date_of_birth?: unknown
  sex?: unknown
  birth_weight_g?: unknown
  gestational_age_wk?: unknown
  popia_consent?: unknown
}

/**
 * Validate a new/edited dependant. POPIA consent is required before a child's
 * special-personal data may be stored (see dependants.popia_consent).
 */
export function validateDependant(input: DependantInput): ValidationResult {
  const name = typeof input.full_name === 'string' ? input.full_name.trim() : ''
  if (name.length < 1) return fail('full_name is required')
  if (name.length > 120) return fail('full_name must be 120 characters or fewer')

  if (!isISODate(input.date_of_birth)) return fail('date_of_birth must be a valid YYYY-MM-DD date')
  if (!isNotFuture(input.date_of_birth as string)) return fail('date_of_birth cannot be in the future')

  if (input.sex != null && !isSex(input.sex)) return fail("sex must be 'male' or 'female'")

  if (input.birth_weight_g != null) {
    const r = inRange(input.birth_weight_g, CHILD_RANGES.birthWeightG, 'birth_weight_g')
    if (!r.ok) return r
  }
  if (input.gestational_age_wk != null) {
    const r = inRange(input.gestational_age_wk, CHILD_RANGES.gestationalAgeWk, 'gestational_age_wk')
    if (!r.ok) return r
  }
  if (input.popia_consent !== true) return fail('popia_consent is required to store a child record')
  return ok
}

// ── Immunisation ──────────────────────────────────────────────
export type ImmunisationInput = {
  vaccine_code?: unknown
  vaccine_name?: unknown
  status?: unknown
  source?: unknown
  due_date?: unknown
  given_date?: unknown
}

/** Validate an immunisation row. A 'given' dose must carry a (non-future) given_date. */
export function validateImmunisation(input: ImmunisationInput): ValidationResult {
  if (typeof input.vaccine_code !== 'string' || input.vaccine_code.trim() === '')
    return fail('vaccine_code is required')
  if (typeof input.vaccine_name !== 'string' || input.vaccine_name.trim() === '')
    return fail('vaccine_name is required')

  const status = input.status ?? 'due'
  if (!isImmunisationStatus(status))
    return fail("status must be one of 'due','given','skipped','contraindicated'")

  const source = input.source ?? 'manual'
  if (!isChildRecordSource(source)) return fail("source must be one of 'manual','scan','import'")

  if (input.due_date != null && !isISODate(input.due_date))
    return fail('due_date must be a valid YYYY-MM-DD date')

  if (status === 'given') {
    if (!isISODate(input.given_date)) return fail("a 'given' dose requires a valid given_date")
    if (!isNotFuture(input.given_date as string)) return fail('given_date cannot be in the future')
  } else if (input.given_date != null && !isISODate(input.given_date)) {
    return fail('given_date must be a valid YYYY-MM-DD date')
  }
  return ok
}

// ── Growth measurement ────────────────────────────────────────
export type GrowthMeasurementInput = {
  measured_at?: unknown
  weight_kg?: unknown
  length_cm?: unknown
  head_circ_cm?: unknown
  muac_cm?: unknown
  source?: unknown
}

/** Validate a growth measurement. At least one metric must be present and in range. */
export function validateGrowthMeasurement(input: GrowthMeasurementInput): ValidationResult {
  if (!isISODate(input.measured_at)) return fail('measured_at must be a valid YYYY-MM-DD date')
  if (!isNotFuture(input.measured_at as string)) return fail('measured_at cannot be in the future')

  const source = input.source ?? 'manual'
  if (!isChildRecordSource(source)) return fail("source must be one of 'manual','scan','import'")

  const checks: Array<[unknown, Range, string]> = [
    [input.weight_kg, CHILD_RANGES.weightKg, 'weight_kg'],
    [input.length_cm, CHILD_RANGES.lengthCm, 'length_cm'],
    [input.head_circ_cm, CHILD_RANGES.headCircCm, 'head_circ_cm'],
    [input.muac_cm, CHILD_RANGES.muacCm, 'muac_cm'],
  ]

  let anyPresent = false
  for (const [value, range, field] of checks) {
    if (value == null) continue
    anyPresent = true
    if (!isFiniteNumber(value)) return fail(`${field} must be a number`)
    const r = inRange(value, range, field)
    if (!r.ok) return r
  }
  if (!anyPresent) return fail('at least one measurement (weight, length, head circumference, or MUAC) is required')
  return ok
}

// ── Milestone ─────────────────────────────────────────────────
export type MilestoneInput = {
  milestone?: unknown
  domain?: unknown
  status?: unknown
  achieved_on?: unknown
}

/** Validate a milestone row. An 'achieved' milestone should carry an achieved_on date. */
export function validateMilestone(input: MilestoneInput): ValidationResult {
  if (typeof input.milestone !== 'string' || input.milestone.trim() === '')
    return fail('milestone is required')
  if (input.domain != null && !isMilestoneDomain(input.domain))
    return fail("domain must be one of 'motor','language','social','cognitive'")

  const status = input.status ?? 'not_yet'
  if (!isMilestoneStatus(status)) return fail("status must be one of 'not_yet','achieved','concern'")

  if (input.achieved_on != null && !isISODate(input.achieved_on))
    return fail('achieved_on must be a valid YYYY-MM-DD date')
  if (status === 'achieved' && input.achieved_on != null && !isNotFuture(input.achieved_on as string))
    return fail('achieved_on cannot be in the future')
  return ok
}
