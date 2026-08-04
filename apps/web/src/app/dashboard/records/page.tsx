import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import RecordsView from '@/components/records/RecordsView'
import RecordsClient from '@/components/records/RecordsClient'

export const metadata: Metadata = { title: 'Records — VitaTrack' }
export const revalidate = 60

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function RecordsPage() {
  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) return <RecordsClient />

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
  if (membership) targetProfileId = (membership as any).owner_id

  const [{ data: visits }, { data: documents }] = await Promise.all([
    supabase
      .from('doctor_visits')
      .select('*')
      .eq('profile_id', targetProfileId)
      .order('visit_date', { ascending: false })
      .limit(50),
    supabase
      .from('health_documents')
      .select('*')
      .eq('profile_id', targetProfileId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return <RecordsView visits={visits ?? []} documents={documents ?? []} isCaregiver={!!membership} />
}
