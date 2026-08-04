import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import NotificationsView from '@/components/notifications/NotificationsView'
import NotificationsClient from '@/components/notifications/NotificationsClient'

export const metadata: Metadata = { title: 'Notifications — VitaTrack' }
export const dynamic = 'force-dynamic'

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

/**
 * Notifications inbox — web parity with the mobile notifications screen.
 * Aggregates low-supply refill alerts and today's missed / pending doses.
 */
export default async function NotificationsPage() {
  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) return <NotificationsClient />

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  let targetProfileId = user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle()
  if (membership) targetProfileId = (membership as any).owner_id

  const nowSast = new Date(Date.now() + 2 * 3600 * 1000)
  const startTodayUtc = new Date(
    Date.UTC(nowSast.getUTCFullYear(), nowSast.getUTCMonth(), nowSast.getUTCDate()) - 2 * 3600 * 1000,
  )

  const [{ data: meds }, { data: doses }] = await Promise.all([
    supabase
      .from('medications')
      .select('id, name, pill_count, refill_threshold')
      .eq('profile_id', targetProfileId)
      .eq('is_active', true),
    supabase
      .from('dose_logs')
      .select('id, medication_id, scheduled_at, status, medication:medications(name)')
      .eq('profile_id', targetProfileId)
      .in('status', ['pending', 'missed'])
      .gte('scheduled_at', startTodayUtc.toISOString())
      .order('scheduled_at', { ascending: true }),
  ])

  return <NotificationsView meds={meds ?? []} doses={doses ?? []} />
}
