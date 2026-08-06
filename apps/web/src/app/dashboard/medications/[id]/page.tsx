import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import MedicationDetailView from '@/components/medications/MedicationDetailView'
import MedicationDetailClient from '@/components/medications/MedicationDetailClient'

export const metadata: Metadata = { title: 'Medication — VitaTrack' }
export const dynamic = 'force-dynamic'

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function MedicationDetailPage({ params }: { params: { id: string } }) {
  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) return <MedicationDetailClient id={params.id} />

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

  const [{ data: med }, { data: history }] = await Promise.all([
    supabase
      .from('medications')
      .select('*, schedules:medication_schedules(*)')
      .eq('id', params.id)
      .eq('profile_id', targetProfileId)
      .maybeSingle(),
    supabase
      .from('dose_logs')
      .select('*')
      .eq('medication_id', params.id)
      .eq('profile_id', targetProfileId)
      .gte('logged_at', cutoff30.toISOString())
      .order('logged_at', { ascending: false }),
  ])

  return <MedicationDetailView med={med ?? null} history={history ?? []} />
}
