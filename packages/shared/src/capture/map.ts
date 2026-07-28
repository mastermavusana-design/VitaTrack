// ── Map a verified QR payload into the common ExtractionResult ────────
// So a scanned QR (perfect data) and an OCR read (fuzzy data) render
// through the EXACT same review screen — QR items simply arrive as
// high-confidence fields.

import type { ReadingQRPayload } from './qr'
import type { ExtractionResult, VitalsExtraction, LabExtraction } from './types'
import { field } from './types'
import type { VitalType, GlucoseUnit } from '../types'

const VITAL_KEYS = new Set([
  'systolic', 'diastolic', 'pulse', 'glucose', 'weight', 'temp', 'temperature', 'spo2', 'heart_rate',
])

function inferVitalType(keys: string[]): VitalType {
  if (keys.includes('systolic') || keys.includes('diastolic')) return 'blood_pressure'
  if (keys.includes('glucose')) return 'glucose'
  if (keys.includes('weight')) return 'weight'
  if (keys.includes('temp') || keys.includes('temperature')) return 'temperature'
  if (keys.includes('spo2')) return 'spo2'
  return 'heart_rate'
}

/** Turn a signed, verified QR payload into an ExtractionResult (all fields high-confidence). */
export function qrToExtraction(payload: ReadingQRPayload): ExtractionResult {
  const base: ExtractionResult = {
    artifact: payload.artifact,
    method: 'qr',
    engine: `qr:${payload.iss}`,
    warnings: [],
    recordedAt: payload.at ? field(payload.at, 'high') : undefined,
  }

  const keys = payload.items.map(i => i.k.toLowerCase())
  const looksLikeVitals = keys.some(k => VITAL_KEYS.has(k))

  if (payload.artifact === 'device_screen' || looksLikeVitals) {
    const v: VitalsExtraction = { type: inferVitalType(keys) }
    for (const item of payload.items) {
      const num = typeof item.v === 'number' ? item.v : Number(item.v)
      const k = item.k.toLowerCase()
      if (k === 'systolic') v.systolic = field(num, 'high', String(item.v))
      else if (k === 'diastolic') v.diastolic = field(num, 'high', String(item.v))
      else if (k === 'pulse') v.pulse = field(num, 'high', String(item.v))
      else if (k === 'glucose') {
        v.glucose = field(num, 'high', String(item.v))
        if (item.u === 'mmol/L' || item.u === 'mg/dL') v.glucoseUnit = field(item.u as GlucoseUnit, 'high')
      } else if (k === 'weight') {
        v.weight = field(num, 'high', String(item.v))
        if (item.u === 'kg' || item.u === 'lbs') v.weightUnit = field(item.u, 'high')
      } else if (k === 'spo2') v.spo2 = field(num, 'high', String(item.v))
      else if (k === 'heart_rate') v.heartRate = field(num, 'high', String(item.v))
    }
    base.vitals = v
    return base
  }

  // Otherwise treat items as lab analytes.
  base.labs = payload.items.map<LabExtraction>(item => ({
    analyte: field(item.k, 'high'),
    value: field(item.v, 'high', String(item.v)),
    unit: item.u ? field(item.u, 'high') : undefined,
    refLow: item.lo != null ? field(item.lo, 'high') : undefined,
    refHigh: item.hi != null ? field(item.hi, 'high') : undefined,
  }))
  return base
}
