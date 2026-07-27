/**
 * VitaTrack Edge Function: refill-daily
 *
 * Runs once per day at 09:00 SAST (07:00 UTC).
 * Finds all medications where pill_count <= refill_threshold
 * and sends push notifications to both the patient and their co-manager.
 *
 * Deploy:
 *   supabase functions deploy refill-daily --no-verify-jwt
 *
 * Cron (supabase/config.toml):
 *   [functions.refill-daily]
 *   schedule = "0 7 * * *"
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface LowStockRow {
  medication_id:     string
  medication_name:   string
  pill_count:        number
  refill_threshold:  number
  patient_token:     string | null
  caregiver_token:   string | null
  patient_name:      string | null
  profile_id:        string
}

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase    = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // Query: active meds where pill_count <= refill_threshold
  const { data: lowStock, error } = await supabase
    .from('medications')
    .select(`
      id,
      name,
      pill_count,
      refill_threshold,
      profile_id,
      profiles!medications_profile_id_fkey (
        full_name,
        expo_push_token
      ),
      family_members!family_members_owner_id_fkey (
        invitee:profiles!family_members_invitee_id_fkey (
          expo_push_token
        )
      )
    `)
    .eq('is_active', true)
    .not('pill_count', 'is', null)
    .lte('pill_count', supabase.rpc('refill_threshold_col'))

  // Fallback: manual query if RPC column reference doesn't work
  const { data: medsRaw } = await supabase
    .from('medications')
    .select('id, name, pill_count, refill_threshold, profile_id')
    .eq('is_active', true)
    .not('pill_count', 'is', null)
    .not('refill_threshold', 'is', null)

  const lowMeds = (medsRaw ?? []).filter(
    (m: any) => m.pill_count !== null && m.refill_threshold !== null && m.pill_count <= m.refill_threshold
  )

  if (lowMeds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: 'No low-stock medications' }), { status: 200 })
  }

  // Fetch push tokens for each profile
  const profileIds = [...new Set(lowMeds.map((m: any) => m.profile_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, expo_push_token')
    .in('id', profileIds)

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  // Fetch caregiver tokens
  const { data: familyMembers } = await supabase
    .from('family_members')
    .select('owner_id, invitee:profiles!family_members_invitee_id_fkey(expo_push_token)')
    .in('owner_id', profileIds)
    .eq('status', 'accepted')

  const caregiverMap = new Map<string, string>()
  for (const fm of familyMembers ?? []) {
    const token = (fm.invitee as any)?.expo_push_token
    if (token) caregiverMap.set((fm as any).owner_id, token)
  }

  // Build push messages
  const pushMessages: object[] = []

  for (const med of lowMeds as any[]) {
    const profile = profileMap.get(med.profile_id)
    if (!profile) continue

    const body = `Only ${med.pill_count} tablet${med.pill_count === 1 ? '' : 's'} left. Request a refill soon.`

    // Notify patient
    if (profile.expo_push_token) {
      pushMessages.push({
        to:       profile.expo_push_token,
        title:    `⚠️ Refill Needed: ${med.name}`,
        body,
        data:     { type: 'refill_alert', medicationId: med.id },
        sound:    'default',
        priority: 'default',
        channelId: 'vitatrack-refill',
      })
    }

    // Notify caregiver
    const caregiverToken = caregiverMap.get(med.profile_id)
    if (caregiverToken) {
      pushMessages.push({
        to:       caregiverToken,
        title:    `⚠️ Refill Alert — ${profile.full_name ?? 'Patient'}`,
        body:     `${profile.full_name ?? 'Patient'}'s ${med.name} is running low (${med.pill_count} left).`,
        data:     { type: 'caregiver_refill', medicationId: med.id, profileId: med.profile_id },
        sound:    'default',
        priority: 'default',
        channelId: 'vitatrack-refill',
      })
    }
  }

  // Batch send
  let totalSent = 0
  for (let i = 0; i < pushMessages.length; i += 100) {
    const batch = pushMessages.slice(i, i + 100)
    const res = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(batch),
    })
    if (res.ok) totalSent += batch.length
    else console.error('[refill-daily] Expo error:', await res.text())
  }

  return new Response(
    JSON.stringify({ sent: totalSent, lowStockCount: lowMeds.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
