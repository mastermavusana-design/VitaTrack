// ── Confidence gating for extracted vitals ───────────────────────────
// Reuses the SINGLE SOURCE OF TRUTH for plausible ranges
// (VITAL_RANGES / validators in ../validation) so a machine-read value
// is held to exactly the same "is this physically possible?" bar as a
// hand-typed one. Anything implausible is demoted to 'low' confidence so
// the review UI paints it red and the user must fix it — it is never saved
// silently. This is the core clinical-safety guard of the capture feature.

import { VITAL_RANGES, inRange } from '../validation/vitals'
import type { ExtractedField, VitalsExtraction, FieldConfidence } from './types'

/** Demote a numeric field to 'low' confidence if it falls outside its plausible range. */
function gate(
  f: ExtractedField<number> | undefined,
  range: { min: number; max: number },
  label: string,
): ExtractedField<number> | undefined {
  if (!f || f.value == null) return f
  const res = inRange(f.value, range, label)
  if (!res.ok) {
    return { ...f, confidence: 'low' as FieldConfidence }
  }
  return f
}

/**
 * Apply range-based confidence gating across a vitals extraction.
 * Returns a copy; does not mutate. Values that fail validation keep their
 * (now 'low') read so the user can see & correct the misread digit.
 */
export function gateVitals(v: VitalsExtraction): VitalsExtraction {
  const out: VitalsExtraction = { ...v }
  out.systolic  = gate(v.systolic,  VITAL_RANGES.systolic,  'systolic')
  out.diastolic = gate(v.diastolic, VITAL_RANGES.diastolic, 'diastolic')
  out.pulse     = gate(v.pulse,     VITAL_RANGES.pulse,     'pulse')
  out.heartRate = gate(v.heartRate, VITAL_RANGES.heart_rate,'heart rate')
  out.spo2      = gate(v.spo2,      VITAL_RANGES.spo2,      'SpO2')

  // Glucose bounds depend on unit; VITAL_RANGES.glucoseMmol is in mmol/L.
  if (v.glucose && v.glucose.value != null) {
    const unit = v.glucoseUnit?.value ?? 'mmol/L'
    const range =
      unit === 'mg/dL'
        ? { min: VITAL_RANGES.glucoseMmol.min * 18, max: VITAL_RANGES.glucoseMmol.max * 18 }
        : VITAL_RANGES.glucoseMmol
    out.glucose = gate(v.glucose, range, 'glucose')
  }

  if (v.weight && v.weight.value != null) {
    const unit = v.weightUnit?.value ?? 'kg'
    const range = unit === 'lbs' ? VITAL_RANGES.weightLbs : VITAL_RANGES.weightKg
    out.weight = gate(v.weight, range, 'weight')
  }

  if (v.temp && v.temp.value != null) {
    const unit = v.tempUnit?.value ?? '°C'
    const range = unit === '°F' ? VITAL_RANGES.tempF : VITAL_RANGES.tempC
    out.temp = gate(v.temp, range, 'temperature')
  }

  return out
}

/** True when a vitals extraction has at least one high/medium field the user can save. */
export function hasUsableVital(v: VitalsExtraction): boolean {
  const fields: Array<ExtractedField<number> | undefined> = [
    v.systolic, v.diastolic, v.pulse, v.glucose, v.weight, v.temp, v.spo2, v.heartRate,
  ]
  return fields.some(f => f?.value != null && f.confidence !== 'low')
}
