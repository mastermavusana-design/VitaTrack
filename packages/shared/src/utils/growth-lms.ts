// ── WHO Child Growth Standards — LMS method core ──
// Pure, dependency-free math for converting a child's measurement into a
// z-score / percentile against the WHO reference, and back.
//
// The WHO standards distribute each indicator (weight-for-age, length/height-
// for-age, head-circumference-for-age, weight-for-length, BMI-for-age, …) as a
// Box-Cox "LMS" triple at each age (or length/height):
//   L = Box-Cox power (skew), M = median, S = coefficient of variation.
//
// This module is deliberately decoupled from the reference data itself: it
// operates on an LMS triple (or an interpolatable table of them) supplied by
// the caller. The actual WHO numbers are clinical reference data and are loaded
// separately (see PHASE5_BUILD_PLAN.md, item S2) so this engine can be built
// and fully tested without them.
//
// Refs: WHO Child Growth Standards (2006), "Computation of centiles and
// z-scores"; Cole TJ & Green PJ (1992), the LMS method.

import type { Sex } from '../types'

export type LMS = {
  /** Box-Cox power (skewness). May be 0 (log-normal limit). */
  L: number
  /** Median. */
  M: number
  /** Coefficient of variation. */
  S: number
}

// ── Core LMS transforms ───────────────────────────────────────

/**
 * Measurement → z-score for a given LMS triple, WITHOUT the WHO extreme-value
 * adjustment. Uses the log-normal limit when L is (near) zero.
 */
export function lmsToZUnadjusted(value: number, { L, M, S }: LMS): number {
  if (value <= 0 || M <= 0 || S <= 0) return NaN
  return Math.abs(L) < 1e-7
    ? Math.log(value / M) / S
    : (Math.pow(value / M, L) - 1) / (L * S)
}

/**
 * z-score → measurement (inverse of {@link lmsToZUnadjusted}) for a given LMS
 * triple. Log-normal limit when L is (near) zero.
 */
export function zToMeasurement(z: number, { L, M, S }: LMS): number {
  return Math.abs(L) < 1e-7
    ? M * Math.exp(S * z)
    : M * Math.pow(1 + L * S * z, 1 / L)
}

/**
 * Measurement → z-score WITH the WHO adjustment for extreme values.
 *
 * The raw LMS z-score is unstable in the tails, so WHO caps the distribution at
 * ±3 SD and extrapolates linearly beyond, using the width of the outermost SD
 * band (SD2→SD3) as the unit. This is the value the WHO reports and the one to
 * use for flagging severe wasting/stunting/overweight.
 */
export function lmsToZ(value: number, lms: LMS): number {
  const z = lmsToZUnadjusted(value, lms)
  if (!Number.isFinite(z)) return z
  if (z > 3) {
    const sd3 = zToMeasurement(3, lms)
    const sd2 = zToMeasurement(2, lms)
    return 3 + (value - sd3) / (sd3 - sd2)
  }
  if (z < -3) {
    const sd3 = zToMeasurement(-3, lms)
    const sd2 = zToMeasurement(-2, lms)
    return -3 + (value - sd3) / (sd2 - sd3)
  }
  return z
}

// ── z ↔ percentile (standard normal) ──────────────────────────

/**
 * Standard-normal CDF Φ(z) as a percentile in [0, 100].
 * Zelen & Severo (1964) rational approximation; abs error < 7.5e-8.
 */
export function zToPercentile(z: number): number {
  if (z === 0) return 50
  const az = Math.abs(z)
  const t = 1 / (1 + 0.2316419 * az)
  const d = 0.3989422804014327 * Math.exp(-(az * az) / 2) // φ(z)
  const poly =
    t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))))
  const upperTail = d * poly // P(Z > az)
  const cdf = z > 0 ? 1 - upperTail : upperTail
  return cdf * 100
}

/**
 * Inverse standard-normal CDF: percentile in (0, 100) → z.
 * Acklam's rational approximation; abs error < 1.15e-9 in relative terms.
 * Returns ±Infinity at the exact bounds.
 */
export function percentileToZ(percentile: number): number {
  const p = percentile / 100
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (p === 0.5) return 0

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
             -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
             3.754408661907416]

  const pLow = 0.02425
  const pHigh = 1 - pLow
  let q: number, r: number

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > pHigh) {
    q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  q = p - 0.5
  r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
         (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Convenience: measurement → percentile against an LMS triple. */
export function lmsToPercentile(value: number, lms: LMS): number {
  return zToPercentile(lmsToZ(value, lms))
}

// ── Reference tables + interpolation ──────────────────────────

export type GrowthIndicator =
  | 'wfa'    // weight-for-age
  | 'lhfa'   // length/height-for-age
  | 'hcfa'   // head-circumference-for-age
  | 'wfl'    // weight-for-length
  | 'wfh'    // weight-for-height
  | 'bmifa'  // BMI-for-age
  | 'acfa'   // arm-circumference-for-age (MUAC)

/** One reference row: an LMS triple at position x (age in days, or length/height in cm). */
export type LMSPoint = LMS & { x: number }

export type LMSTable = {
  indicator: GrowthIndicator
  sex: Sex
  /** What `x` measures: 'day' for age-based indicators, 'cm' for weight-for-length/height. */
  unitX: 'day' | 'cm'
  /** Rows sorted ascending by x. */
  points: LMSPoint[]
}

/**
 * Linearly interpolate an LMS triple at position x within a table.
 * Clamps to the table's endpoints when x is outside the covered range.
 * Returns null for an empty table.
 */
export function lmsAt(table: LMSTable, x: number): LMS | null {
  const pts = table.points
  if (pts.length === 0) return null
  if (x <= pts[0].x) return { L: pts[0].L, M: pts[0].M, S: pts[0].S }
  const last = pts[pts.length - 1]
  if (x >= last.x) return { L: last.L, M: last.M, S: last.S }

  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].x <= x) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  const f = (x - a.x) / (b.x - a.x)
  return {
    L: a.L + f * (b.L - a.L),
    M: a.M + f * (b.M - a.M),
    S: a.S + f * (b.S - a.S),
  }
}

// ── Classification into WHO z-score bands ─────────────────────

export type GrowthBand =
  | 'severe_low'   // z < -3
  | 'low'          // -3 ≤ z < -2
  | 'normal'       // -2 ≤ z ≤ 2
  | 'high'         //  2 < z ≤ 3
  | 'severe_high'  // z > 3

/** Bucket a z-score into the standard WHO ±2 / ±3 SD bands. */
export function zBand(z: number): GrowthBand {
  if (z < -3) return 'severe_low'
  if (z < -2) return 'low'
  if (z <= 2) return 'normal'
  if (z <= 3) return 'high'
  return 'severe_high'
}

export type GrowthClassification = {
  band: GrowthBand
  label: string
  color: string
  bgColor: string
  urgent: boolean
}

// Indicator-aware labels for each band. Weight-based low tails and both tails
// of length/head are the clinically actionable ones.
const BAND_LABELS: Record<GrowthIndicator, Partial<Record<GrowthBand, string>>> = {
  wfa:   { severe_low: 'Severely underweight', low: 'Underweight', high: 'High weight-for-age', severe_high: 'High weight-for-age' },
  lhfa:  { severe_low: 'Severely stunted', low: 'Stunted', high: 'Tall', severe_high: 'Very tall' },
  hcfa:  { severe_low: 'Microcephaly (severe)', low: 'Small head circumference', high: 'Large head circumference', severe_high: 'Macrocephaly (severe)' },
  wfl:   { severe_low: 'Severely wasted', low: 'Wasted', high: 'Overweight', severe_high: 'Obese' },
  wfh:   { severe_low: 'Severely wasted', low: 'Wasted', high: 'Overweight', severe_high: 'Obese' },
  bmifa: { severe_low: 'Severely wasted', low: 'Wasted', high: 'Overweight', severe_high: 'Obese' },
  acfa:  { severe_low: 'Severe acute malnutrition', low: 'Moderate acute malnutrition', high: '', severe_high: '' },
}

const BAND_STYLE: Record<GrowthBand, { color: string; bgColor: string; urgent: boolean }> = {
  severe_low:  { color: '#dc2626', bgColor: '#fee2e2', urgent: true  },
  low:         { color: '#d97706', bgColor: '#fef3c7', urgent: false },
  normal:      { color: '#059669', bgColor: '#d1fae5', urgent: false },
  high:        { color: '#d97706', bgColor: '#fef3c7', urgent: false },
  severe_high: { color: '#dc2626', bgColor: '#fee2e2', urgent: true  },
}

/** Classify a z-score for a given indicator into a labelled, colour-coded band. */
export function classifyGrowthZ(z: number, indicator: GrowthIndicator): GrowthClassification {
  const band = zBand(z)
  const style = BAND_STYLE[band]
  const label = BAND_LABELS[indicator]?.[band] || (band === 'normal' ? 'Normal' : band)
  return { band, label, ...style }
}
