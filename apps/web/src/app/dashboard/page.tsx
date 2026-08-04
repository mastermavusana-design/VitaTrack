import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import DashboardHomeView from '@/components/dashboard/DashboardHomeView'
import DashboardHomeClient from '@/components/dashboard/DashboardHomeClient'

export const metadata: Metadata = { title: 'Dashboard — VitaTrack' }
export const revalidate = 60

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function DashboardPage() {
  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) return <DashboardHomeClient />

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  let targetProfileId = user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id, owner:profiles!family_members_owner_id_fkey(full_name)')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle()

  const isCaregiver = !!membership
  if (isCaregiver) targetProfileId = (membership as any).owner_id

  const cutoff90 = new Date()
  cutoff90.setDate(cutoff90.getDate() - 90)

  const [{ data: meds }, { data: recentVitals }, { data: doseLogs }] = await Promise.all([
    supabase
      .from('medications')
      .select('id, name, strength, strength_unit, form, pill_count, refill_threshold, color, is_active')
      .eq('profile_id', targetProfileId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('vitals')
      .select('*')
      .eq('profile_id', targetProfileId)
      .gte('recorded_at', cutoff90.toISOString())
      .order('recorded_at', { ascending: false })
      .limit(90),
    supabase
      .from('dose_logs')
      .select('*')
      .eq('profile_id', targetProfileId)
      .gte('logged_at', cutoff90.toISOString())
      .order('logged_at', { ascending: false }),
  ])

  const ownerName = isCaregiver ? ((membership as any).owner?.full_name ?? 'Patient') : 'Your'

  return (
    <DashboardHomeView
      meds={meds ?? []}
      recentVitals={recentVitals ?? []}
      doseLogs={doseLogs ?? []}
      isCaregiver={isCaregiver}
      ownerName={ownerName}
    />
  )
}
