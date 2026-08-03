import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import CaregiversClient from './CaregiversClient'

export const metadata: Metadata = { title: 'Family Sharing — VitaTrack' }
export const revalidate = 0

export default async function CaregiversPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Caregivers I have invited (I am owner)
  const { data: myInvites } = await supabase
    .from('family_members')
    .select('id, status, invitee_email, invite_token, invited_at, accepted_at, role')
    .eq('owner_id', user.id)
    .order('invited_at', { ascending: false })

  // Check if I am myself a caregiver for someone else
  const { data: caregiverOf } = await supabase
    .from('family_members')
    .select('id, owner_id, status, role')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle()

  let ownerProfile: { full_name: string | null } | null = null
  if (caregiverOf?.owner_id) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', caregiverOf.owner_id)
      .maybeSingle()
    ownerProfile = data
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Family Sharing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Invite a trusted person to view your health data and receive missed-dose alerts on your behalf.
        </p>
      </div>

      {/* If this user is themselves a caregiver */}
      {caregiverOf && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <p className="text-sm font-semibold text-blue-800">
            👁 You are viewing as a caregiver
          </p>
          <p className="text-sm text-blue-600 mt-1">
            You have caregiver access to <strong>{ownerProfile?.full_name ?? 'their account'}</strong>.
            The dashboard shows their data.
          </p>
        </div>
      )}

      <CaregiversClient
        invites={(myInvites ?? []) as any[]}
        userId={user.id}
      />
    </div>
  )
}
