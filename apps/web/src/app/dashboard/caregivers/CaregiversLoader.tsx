'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { cachedSelect } from '@/lib/dataStore'
import CaregiversView from './CaregiversView'

/**
 * Client-direct family-sharing read (R1 Phase B). Reads the caller's invites and
 * caregiver relationship from the af-south-1 Data API under RLS, with an offline
 * read-cache fallback, then renders the shared view.
 */
export default function CaregiversLoader() {
  const [state, setState] = useState<{
    invites: any[]; userId: string; caregiverOf: any | null; ownerName: string | null
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClientComponentClient()
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess.session?.user.id
      if (!uid) { if (!cancelled) setState({ invites: [], userId: '', caregiverOf: null, ownerName: null }); return }

      const [invitesRes, caregiverRes] = await Promise.all([
        cachedSelect<any>(`cg_invites:${uid}`, (sb) =>
          sb.from('family_members')
            .select('id, status, invitee_email, invite_token, invited_at, accepted_at, role')
            .eq('owner_id', uid)
            .order('invited_at', { ascending: false }),
        ),
        cachedSelect<any>(`cg_of:${uid}`, (sb) =>
          sb.from('family_members').select('id, owner_id, status, role')
            .eq('invitee_id', uid)
            .eq('status', 'accepted')
            .limit(1),
        ),
      ])
      const caregiverOf = caregiverRes.rows[0] ?? null

      let ownerName: string | null = null
      if (caregiverOf?.owner_id) {
        const p = await cachedSelect<any>(`profile_name:${caregiverOf.owner_id}`, (sb) =>
          sb.from('profiles').select('full_name').eq('id', caregiverOf.owner_id).limit(1))
        ownerName = p.rows[0]?.full_name ?? null
      }
      if (cancelled) return
      setState({ invites: invitesRes.rows, userId: uid, caregiverOf, ownerName })
      setNotice(invitesRes.fromCache || caregiverRes.fromCache ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [])

  if (state === null) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="h-8 w-44 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <CaregiversView
      invites={state.invites}
      userId={state.userId}
      caregiverOf={state.caregiverOf}
      ownerName={state.ownerName}
      notice={notice}
    />
  )
}
