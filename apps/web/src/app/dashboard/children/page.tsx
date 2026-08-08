import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import ChildrenView from '@/components/children/ChildrenView'
import ChildrenClient from '@/components/children/ChildrenClient'

export const metadata: Metadata = { title: 'Children — VitaTrack' }
export const revalidate = 60

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function ChildrenPage() {
  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) {
    return <ChildrenClient />
  }

  // ── Flag off: server-side render via the /api fallback data path. ──
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: dependants } = await supabase
    .from('dependants')
    .select('*')
    .eq('guardian_id', user.id)
    .is('archived_at', null)
    .order('date_of_birth', { ascending: true })

  return <ChildrenView dependants={dependants ?? []} />
}
