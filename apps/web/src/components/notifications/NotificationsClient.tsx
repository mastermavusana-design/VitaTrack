'use client'

import { useEffect, useState } from 'react'
import { cachedSelect, resolveOwnerContext } from '@/lib/dataStore'
import NotificationsView from './NotificationsView'

/**
 * Client-direct notifications read (R1 Phase B). Fetches active meds + today's
 * pending/missed doses from the af-south-1 Data API under RLS, with an offline
 * read-cache fallback, then renders the shared view.
 */
export default function NotificationsClient() {
  const [data, setData] = useState<{ meds: any[]; doses: any[] } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ctx = await resolveOwnerContext()
      if (!ctx) {
        if (!cancelled) { setData({ meds: [], doses: [] }); setNotice('Session expired — please sign in again.') }
        return
      }
      // Start of today in SAST (UTC+2, no DST) — the app's default clock.
      const nowSast = new Date(Date.now() + 2 * 3600 * 1000)
      const startTodayUtc = new Date(
        Date.UTC(nowSast.getUTCFullYear(), nowSast.getUTCMonth(), nowSast.getUTCDate()) - 2 * 3600 * 1000,
      )

      const [medsRes, dosesRes] = await Promise.all([
        cachedSelect<any>(`notif_meds:${ctx.profileId}`, (sb) =>
          sb.from('medications').select('id, name, pill_count, refill_threshold')
            .eq('profile_id', ctx.profileId)
            .eq('is_active', true),
        ),
        cachedSelect<any>(`notif_doses:${ctx.profileId}`, (sb) =>
          sb.from('dose_logs').select('id, medication_id, scheduled_at, status, medication:medications(name)')
            .eq('profile_id', ctx.profileId)
            .in('status', ['pending', 'missed'])
            .gte('scheduled_at', startTodayUtc.toISOString())
            .order('scheduled_at', { ascending: true }),
        ),
      ])
      if (cancelled) return
      setData({ meds: medsRes.rows, doses: dosesRes.rows })
      setNotice(medsRes.fromCache || dosesRes.fromCache ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [])

  if (data === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-gray-100 rounded animate-pulse" />
        <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return <NotificationsView meds={data.meds} doses={data.doses} notice={notice} />
}
