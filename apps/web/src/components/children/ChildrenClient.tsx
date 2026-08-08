'use client'

import { useEffect, useState } from 'react'
import { cachedSelect, currentUserId } from '@/lib/dataStore'
import ChildrenView from './ChildrenView'

/**
 * Client-direct children read (R1 Phase B). Fetches the guardian's non-archived
 * dependants from the af-south-1 Data API under RLS, with an offline read-cache
 * fallback, then renders the shared view.
 */
export default function ChildrenClient() {
  const [dependants, setDependants] = useState<any[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const uid = await currentUserId()
      if (!uid) {
        if (!cancelled) { setDependants([]); setNotice('Session expired — please sign in again.') }
        return
      }
      const res = await cachedSelect<any>(`dependants:${uid}`, (sb) =>
        sb.from('dependants').select('*')
          .eq('guardian_id', uid)
          .is('archived_at', null)
          .order('date_of_birth', { ascending: true }),
      )
      if (cancelled) return
      setDependants(res.rows)
      setNotice(res.fromCache ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [])

  if (dependants === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  return <ChildrenView dependants={dependants} notice={notice} />
}
