'use client'

import { useEffect, useState } from 'react'
import { cachedSelect, resolveOwnerContext } from '@/lib/dataStore'
import MedicationDetailView from './MedicationDetailView'

/**
 * Client-direct medication-detail read (R1 Phase B). Fetches the medication
 * (+ schedules) and its 30-day dose history from the af-south-1 Data API under
 * RLS, with an offline read-cache fallback, then renders the shared view.
 */
export default function MedicationDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<{ med: any | null; history: any[] } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ctx = await resolveOwnerContext()
      if (!ctx) {
        if (!cancelled) { setData({ med: null, history: [] }); setNotice('Session expired — please sign in again.') }
        return
      }
      const cutoff30 = new Date()
      cutoff30.setDate(cutoff30.getDate() - 30)

      const [medRes, histRes] = await Promise.all([
        cachedSelect<any>(`med_detail:${ctx.profileId}:${id}`, (sb) =>
          sb.from('medications').select('*, schedules:medication_schedules(*)')
            .eq('id', id)
            .eq('profile_id', ctx.profileId)
            .limit(1),
        ),
        cachedSelect<any>(`med_history:${ctx.profileId}:${id}`, (sb) =>
          sb.from('dose_logs').select('*')
            .eq('medication_id', id)
            .eq('profile_id', ctx.profileId)
            .gte('logged_at', cutoff30.toISOString())
            .order('logged_at', { ascending: false }),
        ),
      ])
      if (cancelled) return
      setData({ med: medRes.rows[0] ?? null, history: histRes.rows })
      setNotice(medRes.fromCache || histRes.fromCache ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [id])

  if (data === null) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
        <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return <MedicationDetailView med={data.med} history={data.history} notice={notice} />
}
