import type { Vital, VitalType, DoseLog } from '@vitatrack/shared'

/**
 * Pure, serializable analytics for the dashboard. Runs on the server (SSR path)
 * or the client-direct path; the outputs are plain arrays/objects that get
 * passed down into the Recharts client islands.
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDay(iso: string): string {
  const d = new Date(iso)
  return `${MONTH[d.getMonth()]} ${d.getDate()}`
}

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10)

/* ─── Vital series ───────────────────────────────────────────────────────── */
export interface VitalPoint {
  t: string          // ISO
  label: string      // "Aug 6"
  value: number | null
  secondary?: number | null
}

function pick(v: Vital, type: VitalType): { value: number | null; secondary?: number | null } {
  switch (type) {
    case 'blood_pressure': return { value: v.systolic, secondary: v.diastolic }
    case 'glucose':        return { value: v.glucose_value }
    case 'weight':         return { value: v.weight_value }
    case 'temperature':    return { value: v.temp_value }
    case 'spo2':           return { value: v.spo2_value }
    case 'heart_rate':     return { value: v.heart_rate }
    default:               return { value: null }
  }
}

/** Ascending-by-time series for one vital type. */
export function vitalSeries(vitals: Vital[], type: VitalType): VitalPoint[] {
  return vitals
    .filter(v => v.type === type)
    .slice()
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    .map(v => ({ t: v.recorded_at, label: fmtDay(v.recorded_at), ...pick(v, type) }))
}

export function sparkValues(series: VitalPoint[], n = 14): number[] {
  return series.map(p => p.value).filter((x): x is number => x != null).slice(-n)
}

/** Latest and previous non-null reading, plus signed delta. */
export function latestDelta(series: VitalPoint[]): { latest: number | null; prev: number | null; delta: number | null } {
  const vals = series.map(p => p.value).filter((x): x is number => x != null)
  const latest = vals.length ? vals[vals.length - 1] : null
  const prev = vals.length > 1 ? vals[vals.length - 2] : null
  const delta = latest != null && prev != null ? +(latest - prev).toFixed(1) : null
  return { latest, prev, delta }
}

/* ─── Adherence ──────────────────────────────────────────────────────────── */
export interface AdherenceDay {
  date: string      // ISO day
  label: string     // "Aug 6"
  rate: number      // 0–100
  taken: number
  missed: number
  skipped: number
  pending: number
}

export function adherenceDaily(logs: DoseLog[], days = 30): AdherenceDay[] {
  const grouped = new Map<string, { taken: number; missed: number; skipped: number; pending: number }>()
  for (const l of logs) {
    const k = dayKey(l.scheduled_at ?? l.logged_at)
    const g = grouped.get(k) ?? { taken: 0, missed: 0, skipped: 0, pending: 0 }
    g[l.status]++
    grouped.set(k, g)
  }

  const out: AdherenceDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0, 10)
    const g = grouped.get(k) ?? { taken: 0, missed: 0, skipped: 0, pending: 0 }
    const total = g.taken + g.missed + g.skipped + g.pending
    out.push({
      date: k,
      label: `${MONTH[d.getMonth()]} ${d.getDate()}`,
      rate: total > 0 ? Math.round((g.taken / total) * 100) : 0,
      ...g,
    })
  }
  return out
}

export interface WeekBreakdown { label: string; taken: number; missed: number; skipped: number }

/** Last `weeks` calendar weeks (oldest → newest) of taken/missed/skipped counts. */
export function adherenceWeekly(logs: DoseLog[], weeks = 6): WeekBreakdown[] {
  const buckets: WeekBreakdown[] = []
  const now = new Date()
  for (let w = weeks - 1; w >= 0; w--) {
    const end = new Date(now); end.setDate(now.getDate() - w * 7)
    const start = new Date(end); start.setDate(end.getDate() - 6)
    const label = `${MONTH[start.getMonth()]} ${start.getDate()}`
    let taken = 0, missed = 0, skipped = 0
    for (const l of logs) {
      const t = new Date(l.scheduled_at ?? l.logged_at).getTime()
      if (t >= start.setHours(0, 0, 0, 0) && t <= end.setHours(23, 59, 59, 999)) {
        if (l.status === 'taken') taken++
        else if (l.status === 'missed') missed++
        else if (l.status === 'skipped') skipped++
      }
    }
    buckets.push({ label, taken, missed, skipped })
  }
  return buckets
}

export interface AdherenceSummary {
  rate: number
  taken: number
  missed: number
  skipped: number
  total: number
  streak: number
  label: 'excellent' | 'good' | 'fair' | 'poor'
  color: string
}

export function adherenceSummary(logs: DoseLog[], days = 28): AdherenceSummary {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
  const recent = logs.filter(l => new Date(l.scheduled_at ?? l.logged_at) >= cutoff)
  const taken = recent.filter(l => l.status === 'taken').length
  const missed = recent.filter(l => l.status === 'missed').length
  const skipped = recent.filter(l => l.status === 'skipped').length
  const total = recent.length
  const rate = total > 0 ? Math.round((taken / total) * 100) : 0

  let label: AdherenceSummary['label']; let color: string
  if (rate >= 90) { label = 'excellent'; color = '#059669' }
  else if (rate >= 75) { label = 'good'; color = '#16A34A' }
  else if (rate >= 60) { label = 'fair'; color = '#D97706' }
  else { label = 'poor'; color = '#DC2626' }

  // streak of consecutive days (from today back) with ≥1 taken
  const takenDays = new Set(logs.filter(l => l.status === 'taken').map(l => new Date(l.logged_at).toDateString()))
  let streak = 0; const d = new Date()
  while (takenDays.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1) }

  return { rate, taken, missed, skipped, total, streak, label, color }
}

/* ─── Per-medication adherence ───────────────────────────────────────────── */
export interface MedAdherence {
  id: string
  taken: number
  total: number
  rate: number
}

export function perMedAdherence(logs: DoseLog[], days = 28): Map<string, MedAdherence> {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
  const map = new Map<string, MedAdherence>()
  for (const l of logs) {
    if (new Date(l.scheduled_at ?? l.logged_at) < cutoff) continue
    if (l.status === 'pending') continue
    const m = map.get(l.medication_id) ?? { id: l.medication_id, taken: 0, total: 0, rate: 0 }
    m.total++
    if (l.status === 'taken') m.taken++
    map.set(l.medication_id, m)
  }
  for (const m of map.values()) m.rate = m.total > 0 ? Math.round((m.taken / m.total) * 100) : 0
  return map
}

/* ─── Vitals logging cadence (activity heat) ─────────────────────────────── */
/** Count of vital readings per day for the last `days` days. */
export function readingsPerDay(vitals: Vital[], days = 30): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const v of vitals) counts.set(dayKey(v.recorded_at), (counts.get(dayKey(v.recorded_at)) ?? 0) + 1)
  const out: { label: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0, 10)
    out.push({ label: `${MONTH[d.getMonth()]} ${d.getDate()}`, count: counts.get(k) ?? 0 })
  }
  return out
}
