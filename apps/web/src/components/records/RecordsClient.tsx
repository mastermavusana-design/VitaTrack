'use client'

import { useEffect, useState } from 'react'
import { cachedSelect, resolveOwnerContext } from '@/lib/dataStore'
import RecordsView from './RecordsView'

/**
 * Client-direct records read (R1 Phase B). Fetches doctor visits + health
 * documents from the af-south-1 Data API under RLS, with an offline read-cache
 * fallback, then renders the shared view.
 */
export default function RecordsClient() {
  const [data, setData] = useState<{ visits: any[]; documents: any[]; isCaregiver: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ctx = await resolveOwnerContext()
      if (!ctx) {
        if (!cancelled) { setData({ visits: [], documents: [], isCaregiver: false }); setNotice('Session expired — please sign in again.') }
        return
      }
      const [visitsRes, docsRes] = await Promise.all([
        cachedSelect<any>(`doctor_visits:${ctx.profileId}`, (sb) =>
          sb.from('doctor_visits').select('*')
            .eq('profile_id', ctx.profileId)
            .order('visit_date', { ascending: false })
            .limit(50),
        ),
        cachedSelect<any>(`health_documents:${ctx.profileId}`, (sb) =>
          sb.from('health_documents').select('*')
            .eq('profile_id', ctx.profileId)
            .order('created_at', { ascending: false })
            .limit(50),
        ),
      ])
      if (cancelled) return
      setData({ visits: visitsRes.rows, documents: docsRes.rows, isCaregiver: ctx.role !== 'owner' })
      setNotice(visitsRes.fromCache || docsRes.fromCache ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [])

  if (data === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-44 bg-gray-100 rounded animate-pulse" />
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return <RecordsView visits={data.visits} documents={data.documents} isCaregiver={data.isCaregiver} notice={notice} />
}
