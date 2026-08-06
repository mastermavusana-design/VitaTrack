'use client'

import { useEffect, useState } from 'react'
import { cachedSelect, currentUserId } from '@/lib/dataStore'
import IceClient from './IceClient'

/**
 * Client-direct ICE read (R1 Phase B). Fetches the emergency profile from the
 * af-south-1 Data API under RLS, then mounts the existing IceClient form with it.
 */
export default function IceLoader() {
  const [state, setState] = useState<{ ice: any } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const uid = await currentUserId()
      if (!uid) { if (!cancelled) setState({ ice: null }); return }
      const res = await cachedSelect<any>(`ice:${uid}`, (sb) =>
        sb.from('ice_profiles').select('*').eq('profile_id', uid).limit(1),
      )
      if (!cancelled) setState({ ice: res.rows[0] ?? null })
    })()
    return () => { cancelled = true }
  }, [])

  if (state === null) return <div className="h-64 max-w-2xl bg-gray-100 rounded-xl animate-pulse" />
  // key forces a fresh mount so IceClient's useState picks up the loaded initial.
  return <IceClient key={state.ice ? 'loaded' : 'empty'} initial={state.ice} />
}
