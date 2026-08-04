'use client'

import { useEffect, useState } from 'react'
import { cachedSelect, resolveOwnerContext } from '@/lib/dataStore'
import MedicationsView from './MedicationsView'

/**
 * Client-direct medications read (R1 Phase B). Fetches meds (+ schedules) and the
 * last 30 days of dose logs from the af-south-1 Data API under RLS, with an offline
 * read-cache fallback, then renders the shared view.
 */
export default function MedicationsClient() {
  const [data, setData] = useState<{ meds: any[]; doseLogs: any[] } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ctx = await resolveOwnerContext()
      if (!ctx) {
        if (!cancelled) { setData({ meds: [], doseLogs: [] }); setNotice('Session expired — please sign in again.') }
        return
      }
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)

      const [medsRes, logsRes] = await Promise.all([
        cachedSelect<any>(`medications:${ctx.profileId}`, (sb) =>
          sb.from('medications').select('*, schedules:medication_schedules(*)')
            .eq('profile_id', ctx.profileId)
            .order('is_active', { ascending: false })
            .order('name'),
        ),
        cachedSelect<any>(`dose_logs:${ctx.profileId}:30`, (sb) =>
          sb.from('dose_logs').select('*')
            .eq('profile_id', ctx.profileId)
            .gte('logged_at', cutoff.toISOString())
            .order('logged_at', { ascending: false }),
        ),
      ])
      if (cancelled) return
      setData({ meds: medsRes.rows, doseLogs: logsRes.rows })
      setNotice(medsRes.fromCache || logsRes.fromCache ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [])

  if (data === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  return <MedicationsView meds={data.meds} doseLogs={data.doseLogs} notice={notice} />
}
