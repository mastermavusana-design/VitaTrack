import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import CaregiversView from './CaregiversView'
import CaregiversLoader from './CaregiversLoader'

export const metadata: Metadata = { title: 'Family Sharing — VitaTrack' }
export const revalidate = 0

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function CaregiversPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) return <CaregiversLoader />

  const { data: myInvites } = await supabase
    .from('family_members')
    .select('id, status, invitee_email, invite_token, invited_at, accepted_at, role')
    .eq('owner_id', user.id)
    .order('invited_at', { ascending: false })

  const { data: caregiverOf } = await supabase
    .from('family_members')
    .select('id, owner_id, status, role')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle()

  let ownerName: string | null = null
  if (caregiverOf?.owner_id) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', caregiverOf.owner_id)
      .maybeSingle()
    ownerName = (data as any)?.full_name ?? null
  }

  return (
    <CaregiversView
      invites={myInvites ?? []}
      userId={user.id}
      caregiverOf={caregiverOf ?? null}
      ownerName={ownerName}
    />
  )
}
