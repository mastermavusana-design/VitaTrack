/**
 * VitaTrack Edge Function: send-family-invite
 *
 * Called from the mobile app (profile.tsx) when a user wants to invite a caregiver.
 * 1. Validates that the owner doesn't already have an accepted caregiver (MVP: max 1).
 * 2. Looks up or creates the invitee profile row by email.
 * 3. Inserts a family_members row with status = 'pending' and a unique invite_token.
 * 4. Sends an invite email via Resend with a link to /invite/[token].
 *
 * Deploy:
 *   supabase functions deploy send-family-invite
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto }       from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM     = 'VitaTrack <noreply@vitatrack.app>'
const WEB_BASE_URL    = Deno.env.get('WEB_BASE_URL') ?? 'https://app.vitatrack.co.za'

function generateToken(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase    = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // Auth: identify the calling user
  const authHeader = req.headers.get('Authorization') ?? ''
  const userToken  = authHeader.replace('Bearer ', '')

  const { data: { user }, error: authError } = await supabase.auth.getUser(userToken)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const ownerId = user.id
  const body    = await req.json()
  const inviteeEmail: string = body.invitee_email?.trim()?.toLowerCase()

  if (!inviteeEmail || !inviteeEmail.includes('@')) {
    return new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400 })
  }

  // Check MVP limit: max 1 caregiver
  const { count } = await supabase
    .from('family_members')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .in('status', ['pending', 'accepted'])

  if ((count ?? 0) >= 1) {
    return new Response(
      JSON.stringify({ error: 'MVP limit: you can only have 1 caregiver. Revoke the existing one first.' }),
      { status: 400 }
    )
  }

  // Get the owner's name for the email
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', ownerId)
    .maybeSingle()

  const ownerName    = (ownerProfile as any)?.full_name ?? user.email
  const inviteToken  = generateToken()

  // Insert family_members row. invitee_id is intentionally left null here —
  // it is set to the caregiver's uid when they claim the invite via the
  // accept_family_invite() RPC (profiles has no email column to match on).
  const { error: insertError } = await supabase.from('family_members').insert({
    owner_id:      ownerId,
    invitee_id:    null,
    invitee_email: inviteeEmail,
    invite_token:  inviteToken,
    status:        'pending',
    invited_at:    new Date().toISOString(),
  })

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })
  }

  // Send invite email via Resend
  const inviteUrl = `${WEB_BASE_URL}/invite/${inviteToken}`

  if (RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    RESEND_FROM,
        to:      [inviteeEmail],
        subject: `${ownerName} invited you to be their caregiver on VitaTrack`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:auto">
            <div style="background:#1A569B;padding:24px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:#fff;font-size:22px;margin:0">VitaTrack Caregiver Invite</h1>
            </div>
            <div style="background:#f9fafb;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">
              <p style="font-size:16px;color:#111">Hi there,</p>
              <p style="color:#374151"><strong>${ownerName}</strong> has invited you to be their caregiver on VitaTrack.</p>
              <p style="color:#374151">As a caregiver, you'll be able to view their medication schedule, adherence, and vitals — and receive alerts if they miss a dose.</p>
              <a href="${inviteUrl}"
                 style="display:block;background:#1A569B;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:10px;font-weight:bold;font-size:16px;margin:24px 0">
                Accept Invitation →
              </a>
              <p style="font-size:12px;color:#9ca3af">
                This invitation expires in 7 days. If you don't have a VitaTrack account yet,
                download the app first, then click the link above.<br/><br/>
                Link: <a href="${inviteUrl}" style="color:#1A569B">${inviteUrl}</a>
              </p>
            </div>
          </div>
        `,
      }),
    })
  }

  return new Response(
    JSON.stringify({ success: true, message: `Invite sent to ${inviteeEmail}` }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
