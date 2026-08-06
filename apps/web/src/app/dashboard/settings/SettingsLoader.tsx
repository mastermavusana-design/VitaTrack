'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { cachedSelect } from '@/lib/dataStore'
import SettingsClient from './SettingsClient'
import ReminderSettings from '@/components/reminders/ReminderSettings'
import AppLockSettings from '@/components/lock/AppLockSettings'

/**
 * Client-direct settings read (R1 Phase B). Reads the `profiles` row from the
 * af-south-1 Data API under RLS (auth id/email come from the client session),
 * then renders the existing settings body. Profile writes are already client-direct.
 */
export default function SettingsLoader() {
  const [state, setState] = useState<{ profile: any; userId: string; email: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClientComponentClient()
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess.session?.user.id
      const email = sess.session?.user.email ?? ''
      if (!uid) { if (!cancelled) setState({ profile: null, userId: '', email }); return }
      const res = await cachedSelect<any>(`profile:${uid}`, (sb) =>
        sb.from('profiles').select('*').eq('id', uid).limit(1))
      if (!cancelled) setState({ profile: res.rows[0] ?? null, userId: uid, email })
    })()
    return () => { cancelled = true }
  }, [])

  if (state === null) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />

  return (
    <>
      <SettingsClient key={state.userId} profile={state.profile} email={state.email} userId={state.userId} />
      <ReminderSettings />
      <AppLockSettings
        userId={state.userId}
        userName={state.profile?.full_name ?? state.email ?? 'VitaTrack user'}
      />
    </>
  )
}
