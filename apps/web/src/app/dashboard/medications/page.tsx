import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import MedicationsView from '@/components/medications/MedicationsView'
import MedicationsClient from '@/components/medications/MedicationsClient'

export const metadata: Metadata = { title: 'Medications — VitaTrack' }
export const revalidate = 60

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function MedicationsPage() {
  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) {
    return <MedicationsClient />
  }

  // ── Flag off: server-side render (existing behaviour, now via the shared view). ──
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

  const cutoff30 = new Date()
  cutoff30.setDate(cutoff30.getDate() - 30)

  const [{ data: meds }, { data: doseLogs }] = await Promise.all([
    supabase
      .from('medications')
      .select('*, schedules:medication_schedules(*)')
      .eq('profile_id', targetProfileId)
      .order('is_active', { ascending: false })
      .order('name'),

    supabase
      .from('dose_logs')
      .select('*')
      .eq('profile_id', targetProfileId)
      .gte('logged_at', cutoff30.toISOString())
      .order('logged_at', { ascending: false }),
  ])

  return <MedicationsView meds={meds ?? []} doseLogs={doseLogs ?? []} />
}
