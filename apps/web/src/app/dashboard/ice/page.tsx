import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import IceClient from './IceClient'

export const metadata: Metadata = { title: 'Emergency Profile — VitaTrack' }
export const dynamic = 'force-dynamic'

export default async function IcePage() {
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
