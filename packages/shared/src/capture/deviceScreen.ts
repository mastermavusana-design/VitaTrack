// ── Device-screen text → structured vitals ───────────────────────────
// Pure, dependency-free parser that turns the RAW TEXT read off a medical
// device screen (by on-device OCR — ML Kit / VisionCamera) into a
// VitalsExtraction. Kept in the shared package so it is unit-tested without
// any native module. The mobile app does the OCR, hands the text here, then
// runs gateVitals() to demote anything physically implausible.
//
// It reads glucometers, BP monitors, pulse oximeters, thermometers and
// scales. An optional `hint` (the vital the user was adding) disambiguates
// label-less screens; otherwise the type is inferred from units/labels.

import type { VitalType, GlucoseUnit } from '../types'
import { field, type VitalsExtraction, type FieldConfidence } from './types'

/** Pull all numbers (int or decimal, comma or dot) in reading order. */
function numbers(text: string): number[] {
  const out: number[] = []
  const re = /\d+(?:[.,]\d+)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(Number(m[0].replace(',', '.')))
  return out
}

function has(text: string, ...needles: string[]): boolean {
  const u = text.toUpperCase()
  return needles.some(n => u.includes(n.toUpperCase()))
}

/** Infer which device this text came from, when no hint is given. */
export function detectVitalType(text: string): VitalType {
  if (has(text, 'MMHG') || (has(text, 'SYS') && has(text, 'DIA'))) return 'blood_pressure'
  if (has(text, 'MMOL', 'MG/DL', 'MG/DL', 'GLU', 'GLUCOSE')) return 'glucose'
  if (has(text, 'SPO2', 'SPO²', '%SPO', 'OXYGEN')) return 'spo2'
  if (has(text, '°C', '°F', 'TEMP')) return 'temperature'
  if (has(text, 'KG', 'LBS', 'LB ')) return 'weight'
  if (has(text, 'BPM', 'PULSE', 'HEART')) return 'heart_rate'

  // Fall back to number-shape heuristics.
  const nums = numbers(text)
  if (nums.length >= 2 && nums[0] > nums[1] && nums[0] >= 80 && nums[0] <= 260) return 'blood_pressure'
  if (nums.length === 1 && !Number.isInteger(nums[0]) && nums[0] < 40) return 'glucose'
  return 'glucose'
}

const conf = (present: boolean): FieldConfidence => (present ? 'high' : 'medium')

function parseBloodPressure(text: string, nums: number[]): VitalsExtraction {
  const labelled = has(text, 'MMHG', 'SYS', 'DIA')
  const [a, b, c] = nums
  const v: VitalsExtraction = { type: 'blood_pressure' }
  if (a != null) v.systolic = field(a, conf(labelled), String(a))
  if (b != null) v.diastolic = field(b, conf(labelled), String(b))
  if (c != null) v.pulse = field(c, conf(has(text, 'PUL', 'BPM')), String(c))
  // Sanity: systolic must exceed diastolic; if not, both drop to low for review.
  if (v.systolic?.value != null && v.diastolic?.value != null && v.systolic.value <= v.diastolic.value) {
    v.systolic = { ...v.systolic, confidence: 'low' }
    v.diastolic = { ...v.diastolic, confidence: 'low' }
  }
  return v
}

function parseGlucose(text: string, nums: number[]): VitalsExtraction {
  const v: VitalsExtraction = { type: 'glucose' }
  let unit: GlucoseUnit | null = null
  let unitKnown = false
  if (has(text, 'MG/DL')) { unit = 'mg/dL'; unitKnown = true }
  else if (has(text, 'MMOL')) { unit = 'mmol/L'; unitKnown = true }

  // Choose the value that fits the (known or inferred) unit's plausible range.
  const pick = (lo: number, hi: number) => nums.find(n => n >= lo && n <= hi)
  let value: number | undefined
  if (unit === 'mg/dL') value = pick(10, 990)
  else if (unit === 'mmol/L') value = pick(0.5, 55)
  else {
    // Infer: a decimal < 40 reads as mmol/L; a bare integer > 40 reads as mg/dL.
    const dec = nums.find(n => !Number.isInteger(n))
    if (dec != null && dec < 40) { value = dec; unit = 'mmol/L' }
    else { value = nums.find(n => n >= 40 && n <= 990); unit = 'mg/dL' }
  }
  if (value != null) v.glucose = field(value, unitKnown ? 'high' : 'medium', String(value))
  if (unit) v.glucoseUnit = field(unit, unitKnown ? 'high' : 'medium')
  return v
}

function parseWeight(text: string, nums: number[]): VitalsExtraction {
  const v: VitalsExtraction = { type: 'weight' }
  const unit = has(text, 'LBS', 'LB') ? 'lbs' : 'kg'
  const value = nums.find(n => (unit === 'lbs' ? n >= 1 && n <= 1500 : n >= 1 && n <= 700))
  if (value != null) v.weight = field(value, conf(has(text, 'KG', 'LB')), String(value))
  v.weightUnit = field(unit, conf(has(text, 'KG', 'LB')))
  return v
}

function parseTemperature(text: string, nums: number[]): VitalsExtraction {
  const v: VitalsExtraction = { type: 'temperature' }
  const isF = has(text, '°F') || nums.some(n => n >= 90 && n <= 113)
  const unit = isF ? '°F' : '°C'
  const value = nums.find(n => (isF ? n >= 90 && n <= 113 : n >= 25 && n <= 45))
  if (value != null) v.temp = field(value, conf(has(text, '°C', '°F', 'TEMP')), String(value))
  v.tempUnit = field(unit, conf(has(text, '°C', '°F')))
  return v
}

function parseSpo2(text: string, nums: number[]): VitalsExtraction {
  const v: VitalsExtraction = { type: 'spo2' }
  const spo2 = nums.find(n => n >= 50 && n <= 100)
  if (spo2 != null) v.spo2 = field(spo2, conf(has(text, 'SPO2', '%')), String(spo2))
  // Oximeters usually show pulse (PR/bpm) too.
  const pr = nums.find(n => n >= 25 && n <= 220 && n !== spo2)
  if (pr != null) v.heartRate = field(pr, conf(has(text, 'PR', 'BPM', 'PULSE')), String(pr))
  return v
}

function parseHeartRate(text: string, nums: number[]): VitalsExtraction {
  const v: VitalsExtraction = { type: 'heart_rate' }
  const hr = nums.find(n => n >= 25 && n <= 220)
  if (hr != null) v.heartRate = field(hr, conf(has(text, 'BPM', 'PULSE', 'HEART')), String(hr))
  return v
}

/**
 * Parse OCR text from a device screen into a VitalsExtraction.
 * @param text  raw recognized text (may be multi-line)
 * @param hint  the vital the user was adding, if known (disambiguates label-less screens)
 */
export function parseDeviceScreenText(text: string, hint?: VitalType): VitalsExtraction {
  const type = hint ?? detectVitalType(text)
  const nums = numbers(text)
  switch (type) {
    case 'blood_pressure': return parseBloodPressure(text, nums)
    case 'glucose':        return parseGlucose(text, nums)
    case 'weight':         return parseWeight(text, nums)
    case 'temperature':    return parseTemperature(text, nums)
    case 'spo2':           return parseSpo2(text, nums)
    case 'heart_rate':     return parseHeartRate(text, nums)
    default:               return { type }
  }
}
