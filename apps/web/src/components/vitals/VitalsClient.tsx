'use client'

import { useEffect, useState } from 'react'
import type { Vital, VitalType } from '@vitatrack/shared'
import { cachedSelect, resolveOwnerContext } from '@/lib/dataStore'
import VitalsView from './VitalsView'

/**
 * Client-direct vitals read (R1 Phase B). Fetches from the af-south-1 Data API
 * under RLS with an offline read-cache fallback, then renders the shared view.
 */
export default function VitalsClient({ activeType, days }: { activeType: VitalType; days: number }) {
  const [items, setItems] = useState<Vital[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setItems(null)
      const ctx = await resolveOwnerContext()
      if (!ctx) {
        if (!cancelled) { setItems([]); setNotice('Session expired — please sign in again.') }
        return
      }
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      const key = `vitals:${ctx.profileId}:${activeType}:${days}`
      const res = await cachedSelect<Vital>(key, (sb) =>
        sb.from('vitals').select('*')
          .eq('profile_id', ctx.profileId)
          .eq('type', activeType)
          .gte('recorded_at', cutoff.toISOString())
          .order('recorded_at', { ascending: false })
          .limit(200),
      )
      if (cancelled) return
      setItems(res.rows)
      setNotice(res.fromCache ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [activeType, days])

  if (items === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return <VitalsView items={items} activeType={activeType} days={days} notice={notice} />
}
