import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import IceClient from './IceClient'
import IceLoader from './IceLoader'

export const metadata: Metadata = { title: 'Emergency Profile — VitaTrack' }
export const dynamic = 'force-dynamic'

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function IcePage() {
  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) return <IceLoader />

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: ice } = await supabase
    .from('ice_profiles')
    .select('*')
    .eq('profile_id', user.id)
    .maybeSingle()

  return <IceClient initial={ice ?? null} />
}
