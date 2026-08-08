// ── WHO growth reference — typed loader ───────────────────────
// Turns the auto-generated WHO_RAW tables into the LMSTable shape the
// growth-lms engine consumes, and exposes convenience helpers that go
// straight from a child's measurement to a z-score / percentile / band.
//
// Data provenance: WHO Child Growth Standards (2006), transcribed by
// scripts/gen-who-growth-tables.py from the pygrowup2 package. Age indicators
// are keyed in DAYS; weight-for-length/height in CM.

import type { Sex } from '../../types'
import {
  type GrowthIndicator,
  type LMSTable,
  type LMSPoint,
  type GrowthClassification,
  lmsAt,
  lmsToZ,
  zToPercentile,
  classifyGrowthZ,
} from '../growth-lms'
import { WHO_RAW } from './who-data'

export { WHO_RAW } from './who-data'
export { WHO_GOLDEN } from './who-golden'
export type { GoldenPoint } from './who-golden'

// Lazily build + cache the LMSTable objects (one per indicator×sex).
const cache = new Map<string, LMSTable>()

/** The LMS reference table for an indicator and sex, or null if unavailable. */
export function getLMSTable(indicator: GrowthIndicator, sex: Sex): LMSTable | null {
  const key = `${indicator}:${sex}`
  const hit = cache.get(key)
  if (hit) return hit

  const raw = WHO_RAW[indicator]?.[sex]
  if (!raw) return null

  const points: LMSPoint[] = raw.rows.map(([x, L, M, S]) => ({ x, L, M, S }))
  const table: LMSTable = { indicator, sex, unitX: raw.unitX, points }
  cache.set(key, table)
  return table
}

/** Which indicators exist in the reference data. */
export function availableIndicators(): GrowthIndicator[] {
  return Object.keys(WHO_RAW) as GrowthIndicator[]
}

/**
 * z-score for a measurement against the WHO reference.
 * `x` is age in days (age indicators) or length/height in cm (wfl/wfh).
 * Returns null when no reference table covers that indicator/sex.
 */
export function zScoreFor(
  indicator: GrowthIndicator,
  sex: Sex,
  x: number,
  value: number,
): number | null {
  const table = getLMSTable(indicator, sex)
  if (!table) return null
  const lms = lmsAt(table, x)
  if (!lms) return null
  return lmsToZ(value, lms)
}

/** Percentile (0–100) for a measurement against the WHO reference, or null. */
export function percentileFor(
  indicator: GrowthIndicator,
  sex: Sex,
  x: number,
  value: number,
): number | null {
  const z = zScoreFor(indicator, sex, x, value)
  return z === null ? null : zToPercentile(z)
}

/** Labelled, colour-coded WHO band for a measurement, or null. */
export function classifyFor(
  indicator: GrowthIndicator,
  sex: Sex,
  x: number,
  value: number,
): GrowthClassification | null {
  const z = zScoreFor(indicator, sex, x, value)
  return z === null ? null : classifyGrowthZ(z, indicator)
}

/** Whole days between two ISO dates (measurement age from date of birth). */
export function ageInDays(dobISO: string, atISO: string): number {
  const dob = Date.parse(dobISO + 'T00:00:00Z')
  const at = Date.parse(atISO + 'T00:00:00Z')
  return Math.round((at - dob) / 86_400_000)
}
