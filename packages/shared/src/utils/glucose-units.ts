import type { GlucoseUnit, MealContext } from '../types'

const MMOL_TO_MGDL = 18.0182

export function mmolToMgdl(mmol: number): number {
  return Math.round(mmol * MMOL_TO_MGDL)
}

export function mgdlToMmol(mgdl: number): number {
  return Math.round((mgdl / MMOL_TO_MGDL) * 10) / 10
}

export function convertGlucose(
  value: number,
  from: GlucoseUnit,
  to: GlucoseUnit,
): number {
  if (from === to) return value
  return from === 'mmol/L' ? mmolToMgdl(value) : mgdlToMmol(value)
}

export type GlucoseCategory = 'low' | 'normal' | 'pre_diabetic' | 'diabetic' | 'very_high'

export type GlucoseClassification = {
  category: GlucoseCategory
  label: string
  color: string
  bgColor: string
  urgent: boolean
}

/** Classify fasting glucose in mmol/L (WHO thresholds) */
export function classifyGlucose(
  valueMmol: number,
  context: MealContext = 'fasting',
): GlucoseClassification {
  const thresholds =
    context === 'fasting'
      ? { low: 3.9, normal: 5.6, preDiabetic: 7.0 }
      : { low: 3.9, normal: 7.8, preDiabetic: 11.1 }

  if (valueMmol < thresholds.low)
    return { category: 'low', label: 'Low', color: '#2563eb', bgColor: '#dbeafe', urgent: true }
  if (valueMmol <= thresholds.normal)
    return { category: 'normal', label: 'Normal', color: '#059669', bgColor: '#d1fae5', urgent: false }
  if (valueMmol <= thresholds.preDiabetic)
    return { category: 'pre_diabetic', label: 'Pre-Diabetic', color: '#d97706', bgColor: '#fef3c7', urgent: false }
  if (valueMmol <= 16.7)
    return { category: 'diabetic', label: 'High', color: '#ea580c', bgColor: '#ffedd5', urgent: false }
  return { category: 'very_high', label: 'Very High', color: '#dc2626', bgColor: '#fee2e2', urgent: true }
}

export function formatGlucose(value: number, unit: GlucoseUnit): string {
  return unit === 'mmol/L' ? `${value.toFixed(1)} mmol/L` : `${Math.round(value)} mg/dL`
}
