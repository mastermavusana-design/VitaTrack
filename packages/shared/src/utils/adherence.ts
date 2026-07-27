import type { DoseLog, DoseStatus } from '../types'

export type AdherenceStats = {
  total: number
  taken: number
  missed: number
  skipped: number
  rate: number          // 0–100
  streak: number        // consecutive days with ≥1 taken
  label: 'excellent' | 'good' | 'fair' | 'poor'
  color: string
}

export function calcAdherence(logs: DoseLog[], days = 28): AdherenceStats {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const recent = logs.filter(l => new Date(l.scheduled_at ?? l.logged_at) >= cutoff)
  const total   = recent.length
  const taken   = recent.filter(l => l.status === 'taken').length
  const missed  = recent.filter(l => l.status === 'missed').length
  const skipped = recent.filter(l => l.status === 'skipped').length
  const rate    = total > 0 ? Math.round((taken / total) * 100) : 0

  let label: AdherenceStats['label']
  let color: string
  if (rate >= 90) { label = 'excellent'; color = '#059669' }
  else if (rate >= 75) { label = 'good'; color = '#16a34a' }
  else if (rate >= 60) { label = 'fair'; color = '#d97706' }
  else { label = 'poor'; color = '#dc2626' }

  const streak = calcStreak(logs)
  return { total, taken, missed, skipped, rate, streak, label, color }
}

/** Count consecutive days (from today backwards) with at least one 'taken' dose */
function calcStreak(logs: DoseLog[]): number {
  const taken = logs
    .filter(l => l.status === 'taken')
    .map(l => new Date(l.logged_at).toDateString())

  const takenSet = new Set(taken)
  let streak = 0
  const d = new Date()
  while (takenSet.has(d.toDateString())) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

/** Group dose logs by date string for chart display */
export function groupLogsByDate(
  logs: DoseLog[],
): Record<string, Record<DoseStatus, number>> {
  return logs.reduce<Record<string, Record<DoseStatus, number>>>((acc, log) => {
    const date = new Date(log.scheduled_at ?? log.logged_at).toISOString().split('T')[0]
    if (!acc[date]) acc[date] = { taken: 0, missed: 0, skipped: 0, pending: 0 }
    acc[date][log.status]++
    return acc
  }, {})
}
