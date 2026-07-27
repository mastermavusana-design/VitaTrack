// ── Physiological range validation ────────────────────────────
// Single source of truth for the plausible bounds of each vital.
// Reused by the shared classifiers, the web API routes, and the
// mobile capture forms so validation stays consistent everywhere.
//
// Bounds are deliberately generous (they reject data-entry mistakes
// and garbage, not unusual-but-real clinical values). They are NOT a
// clinical judgement — classification of "normal vs high" lives in the
// classifiers; this layer only answers "is this a physically possible
// reading a human could have recorded?".

import type { GlucoseUnit } from '../types'
import { convertGlucose } from '../utils/glucose-units'

export type Range = { min: number; max: number }

export const VITAL_RANGES = {
  systolic:    { min: 40,  max: 300 },   // mmHg
  diastolic:   { min: 20,  max: 200 },   // mmHg
  pulse:       { min: 20,  max: 300 },   // bpm
  heart_rate:  { min: 20,  max: 300 },   // bpm
  spo2:        { min: 50,  max: 100 },   // %
  glucoseMmol: { min: 0.5, max: 55 },    // mmol/L (~10–990 mg/dL)
  weightKg:    { min: 0.2, max: 700 },   // kg
  weightLbs:   { min: 0.4, max: 1543 },  // lbs
  tempC:       { min: 25,  max: 45 },    // °C
  tempF:       { min: 77,  max: 113 },   // °F
} as const satisfies Record<string, Range>

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string }

const ok: ValidationResult = { ok: true }
const fail = (error: string): ValidationResult => ({ ok: false, error })

/** True when x is a finite real number. */
export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

/** Check a value against a named range, returning a human-readable error. */
export function inRange(value: unknown, range: Range, field: string): ValidationResult {
  if (!isFiniteNumber(value)) return fail(`${field} must be a number`)
  if (value < range.min || value > range.max) {
    return fail(`${field} must be between ${range.min} and ${range.max}`)
  }
  return ok
}

/** Validate a blood-pressure reading (systolic must exceed diastolic). */
export function validateBloodPressure(systolic: unknown, diastolic: unknown): ValidationResult {
  const s = inRange(systolic, VITAL_RANGES.systolic, 'systolic')
  if (!s.ok) return s
  const d = inRange(diastolic, VITAL_RANGES.diastolic, 'diastolic')
  if (!d.ok) return d
  if ((systolic as number) <= (diastolic as number)) {
    return fail('systolic must be greater than diastolic')
  }
  return ok
}

/** Validate glucose in its supplied unit by normalising to mmol/L first. */
export function validateGlucose(value: unknown, unit: GlucoseUnit = 'mmol/L'): ValidationResult {
  if (!isFiniteNumber(value)) return fail('glucose_value must be a number')
  const mmol = unit === 'mmol/L' ? value : convertGlucose(value, 'mg/dL', 'mmol/L')
  return inRange(mmol, VITAL_RANGES.glucoseMmol, 'glucose_value')
}

export function validatePulse(value: unknown): ValidationResult {
  return inRange(value, VITAL_RANGES.pulse, 'pulse')
}

export function validateHeartRate(value: unknown): ValidationResult {
  return inRange(value, VITAL_RANGES.heart_rate, 'heart_rate')
}

export function validateSpo2(value: unknown): ValidationResult {
  return inRange(value, VITAL_RANGES.spo2, 'spo2_value')
}

export function validateWeight(value: unknown, unit: 'kg' | 'lbs' = 'kg'): ValidationResult {
  const range = unit === 'kg' ? VITAL_RANGES.weightKg : VITAL_RANGES.weightLbs
  return inRange(value, range, 'weight_value')
}

export function validateTemperature(value: unknown, unit: '°C' | '°F' = '°C'): ValidationResult {
  const range = unit === '°C' ? VITAL_RANGES.tempC : VITAL_RANGES.tempF
  return inRange(value, range, 'temp_value')
}
