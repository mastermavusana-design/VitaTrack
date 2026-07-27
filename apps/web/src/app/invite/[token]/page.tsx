/**
 * Family invite accept page
 * Route: /invite/[token]
 *
 * Linked from the invite email sent by the send-family-invite Edge Function.
 * If the user is not signed in, they are directed to sign up / log in first.
 * On accept: inserts a family_members row with status = 'accepted'.
 */
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import InviteClient from './InviteClient'

export const metadata: Metadata = {
  title: 'Accept Family Invite — VitaTrack',
}

interface PageProps {
  params: { token: string }
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = params
  const supabase = createServerClient()

  // Look up the pending invite
  const { data: invite, error } = await supabase
    .from('family_members')
    .select(`
      id,
      status,
      owner_id,
      invite_token,
      owner:profiles!family_members_owner_id_fkey(full_name)
    `)
    .eq('invite_token', token)
    .maybeSingle()

  if (error || !invite) notFound()

  // Already accepted
  if ((invite as any).status === 'accepted') {
    redirect('/dashboard')
  }

  const { data: { session } } = await supabase.auth.getSession()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <InviteClient
        invite={invite as any}
        isLoggedIn={!!session}
        token={token}
      />
    </div>
  )
}
