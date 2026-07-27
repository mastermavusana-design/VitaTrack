import { describe, it, expect } from 'vitest'
import { calcAdherence, groupLogsByDate } from './adherence'
import type { DoseLog, DoseStatus } from '../types'

let seq = 0
function log(status: DoseStatus, daysAgo = 0): DoseLog {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  const iso = d.toISOString()
  return {
    id: `dl-${seq++}`,
    medication_id: 'med-1',
    profile_id: 'p-1',
    schedule_id: null,
    scheduled_at: iso,
    logged_at: iso,
    status,
    dose_amount: null,
    dose_unit: null,
    logged_by: null,
    notes: null,
    created_at: iso,
  }
}

describe('calcAdherence', () => {
  it('reports zeros for an empty log set', () => {
    const s = calcAdherence([])
    expect(s).toMatchObject({ total: 0, taken: 0, missed: 0, skipped: 0, rate: 0, streak: 0 })
    expect(s.label).toBe('poor')
  })

  it('computes rate = taken / total as a rounded percentage', () => {
    const logs = [
      log('taken'), log('taken'), log('taken'),
      log('missed'),
    ]
    const s = calcAdherence(logs)
    expect(s.total).toBe(4)
    expect(s.taken).toBe(3)
    expect(s.missed).toBe(1)
    expect(s.rate).toBe(75)
  })

  it('counts skipped separately from missed', () => {
    const s = calcAdherence([log('taken'), log('skipped'), log('missed')])
    expect(s.skipped).toBe(1)
    expect(s.missed).toBe(1)
  })

  it('excludes logs older than the window', () => {
    const s = calcAdherence([log('taken', 0), log('taken', 100)], 28)
    expect(s.total).toBe(1)
  })

  it.each([
    [10, 0, 'excellent'],
    [8, 2, 'good'],
    [6, 4, 'fair'],
    [3, 7, 'poor'],
  ] as const)('labels %i taken / %i missed as %s', (taken, missed, label) => {
    const logs = [
      ...Array.from({ length: taken }, () => log('taken')),
      ...Array.from({ length: missed }, () => log('missed')),
    ]
    expect(calcAdherence(logs).label).toBe(label)
  })

  it('counts a consecutive taken streak from today backwards', () => {
    const s = calcAdherence([log('taken', 0), log('taken', 1), log('taken', 2)])
    expect(s.streak).toBe(3)
  })

  it('breaks the streak on a gap day', () => {
    // taken today and 2 days ago, but nothing yesterday → streak stops at 1
    const s = calcAdherence([log('taken', 0), log('taken', 2)])
    expect(s.streak).toBe(1)
  })

  it('has zero streak when today has no taken dose', () => {
    const s = calcAdherence([log('taken', 1), log('taken', 2)])
    expect(s.streak).toBe(0)
  })
})

describe('groupLogsByDate', () => {
  it('buckets counts by ISO date and status', () => {
    const grouped = groupLogsByDate([log('taken', 0), log('missed', 0), log('taken', 1)])
    const dates = Object.keys(grouped)
    expect(dates).toHaveLength(2)
    const today = new Date().toISOString().split('T')[0]
    expect(grouped[today].taken).toBe(1)
    expect(grouped[today].missed).toBe(1)
    expect(grouped[today].skipped).toBe(0)
  })
})
