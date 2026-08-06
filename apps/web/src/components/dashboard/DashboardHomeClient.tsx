'use client'

import { useEffect, useState } from 'react'
import { cachedSelect, resolveOwnerContext } from '@/lib/dataStore'
import DashboardHomeView from './DashboardHomeView'

/**
 * Client-direct dashboard home read (R1 Phase B). Fetches active meds, 90 days of
 * vitals, and 90 days of dose logs from the af-south-1 Data API under RLS, with an
 * offline read-cache fallback, then renders the shared view.
 */
export default function DashboardHomeClient() {
  const [data, setData] = useState<{
    meds: any[]; recentVitals: any[]; doseLogs: any[]; isCaregiver: boolean; ownerName: string
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ctx = await resolveOwnerContext()
      if (!ctx) {
        if (!cancelled) {
          setData({ meds: [], recentVitals: [], doseLogs: [], isCaregiver: false, ownerName: 'Your' })
          setNotice('Session expired — please sign in again.')
        }
        return
      }
      const isCaregiver = ctx.role !== 'owner'
      const cutoff90 = new Date()
      cutoff90.setDate(cutoff90.getDate() - 90)

      let ownerName = 'Your'
      if (isCaregiver) {
        const p = await cachedSelect<any>(`profile_name:${ctx.profileId}`, (sb) =>
          sb.from('profiles').select('full_name').eq('id', ctx.profileId).limit(1))
        ownerName = p.rows[0]?.full_name ?? 'Patient'
      }

      const [medsRes, vitalsRes, logsRes] = await Promise.all([
        cachedSelect<any>(`home_meds:${ctx.profileId}`, (sb) =>
          sb.from('medications')
            .select('id, name, strength, strength_unit, form, pill_count, refill_threshold, color, is_active')
            .eq('profile_id', ctx.profileId)
            .eq('is_active', true)
            .order('name'),
        ),
        cachedSelect<any>(`home_vitals:${ctx.profileId}`, (sb) =>
          sb.from('vitals').select('*')
            .eq('profile_id', ctx.profileId)
            .gte('recorded_at', cutoff90.toISOString())
            .order('recorded_at', { ascending: false })
            .limit(90),
        ),
        cachedSelect<any>(`home_doses:${ctx.profileId}:90`, (sb) =>
          sb.from('dose_logs').select('*')
            .eq('profile_id', ctx.profileId)
            .gte('logged_at', cutoff90.toISOString())
            .order('logged_at', { ascending: false }),
        ),
      ])
      if (cancelled) return
      setData({
        meds: medsRes.rows, recentVitals: vitalsRes.rows, doseLogs: logsRes.rows, isCaregiver, ownerName,
      })
      setNotice(medsRes.fromCache || vitalsRes.fromCache || logsRes.fromCache
        ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [])

  if (data === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        <div className="h-56 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <DashboardHomeView
      meds={data.meds}
      recentVitals={data.recentVitals}
      doseLogs={data.doseLogs}
      isCaregiver={data.isCaregiver}
      ownerName={data.ownerName}
      notice={notice}
    />
  )
}
