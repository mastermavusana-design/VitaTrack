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

  // Preview the pending invite via a SECURITY DEFINER RPC. The invitee has no
  // direct RLS SELECT on family_members before they've claimed the invite.
  const { data: invite, error } = await supabase
    .rpc('get_pending_invite', { p_token: token })
    .maybeSingle()

  if (error || !invite) notFound()

  const inv = invite as { owner_name: string | null; invite_role: string; invite_status: string }

  // Already accepted
  if (inv.invite_status === 'accepted') {
    redirect('/dashboard')
  }
  if (inv.invite_status === 'revoked') {
    notFound()
  }

  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <InviteClient
        ownerName={inv.owner_name ?? 'Someone'}
        role={inv.invite_role}
        isLoggedIn={!!user}
        token={token}
      />
    </div>
  )
}
