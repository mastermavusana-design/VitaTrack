// ── Camera-capture extraction contract ───────────────────────────────
// One stable shape flows out of EVERY extraction path (on-device OCR,
// cloud vision-LLM, or a decoded VitaTrack QR) so the review UI never
// has to know which engine produced the data.
//
// Design rule: an extractor returns only what it can actually read.
// A field it cannot read confidently is `null` with confidence 'low' —
// it must NEVER invent a plausible value. Confidence gating +
// range validation (see ./validate) turn a raw read into review hints.

import type { VitalType, GlucoseUnit } from '../types'

export type CaptureArtifact =
  | 'device_screen'
  | 'lab_report'
  | 'prescription'
  | 'document'
  | 'qr'

export type CaptureMethod = 'on_device' | 'cloud' | 'qr'

export type FieldConfidence = 'high' | 'medium' | 'low'

/** A single extracted field: the parsed value, how sure we are, and the raw text we saw. */
export type ExtractedField<T> = {
  value: T | null
  confidence: FieldConfidence
  /** The raw substring/token the value was derived from (useful for review + debugging). */
  raw?: string
}

export function field<T>(
  value: T | null,
  confidence: FieldConfidence = value == null ? 'low' : 'high',
  raw?: string,
): ExtractedField<T> {
  return { value, confidence, raw }
}

/** Device-screen extraction (glucometer / BP monitor / oximeter / thermometer / scale). */
export type VitalsExtraction = {
  type: VitalType
  systolic?: ExtractedField<number>
  diastolic?: ExtractedField<number>
  pulse?: ExtractedField<number>
  glucose?: ExtractedField<number>
  glucoseUnit?: ExtractedField<GlucoseUnit>
  weight?: ExtractedField<number>
  weightUnit?: ExtractedField<'kg' | 'lbs'>
  temp?: ExtractedField<number>
  tempUnit?: ExtractedField<'°C' | '°F'>
  spo2?: ExtractedField<number>
  heartRate?: ExtractedField<number>
}

export type LabExtraction = {
  analyte: ExtractedField<string>
  value: ExtractedField<number | string>
  unit?: ExtractedField<string>
  refLow?: ExtractedField<number>
  refHigh?: ExtractedField<number>
  panel?: ExtractedField<string>
}

export type MedicationExtraction = {
  name: ExtractedField<string>
  strength: ExtractedField<string>
  dose: ExtractedField<string>
  frequency: ExtractedField<string>
}

export type DocumentExtraction = {
  category: ExtractedField<string>
  provider: ExtractedField<string>
  date: ExtractedField<string>
  title: ExtractedField<string>
}

/** The single result shape every path emits. */
export type ExtractionResult = {
  artifact: CaptureArtifact
  method: CaptureMethod
  /** Engine/provider id + version, for reproducibility (e.g. 'ondevice-mlkit', 'vision-xyz@2026-07'). */
  engine?: string
  /** ISO timestamp read off the artifact, if it printed one. */
  recordedAt?: ExtractedField<string>
  vitals?: VitalsExtraction
  labs?: LabExtraction[]
  medication?: MedicationExtraction
  document?: DocumentExtraction
  /** Machine-readable hints for the UI, e.g. 'glare_detected', 'unit_ambiguous'. */
  warnings: string[]
}

/** Overall 0..1 confidence — the mean of a set of field confidences (high=1, med=0.6, low=0.2). */
export function overallConfidence(fields: Array<ExtractedField<unknown> | undefined>): number {
  const weights: Record<FieldConfidence, number> = { high: 1, medium: 0.6, low: 0.2 }
  const present = fields.filter((f): f is ExtractedField<unknown> => !!f && f.value != null)
  if (present.length === 0) return 0
  const sum = present.reduce((acc, f) => acc + weights[f.confidence], 0)
  return Math.round((sum / present.length) * 100) / 100
}
