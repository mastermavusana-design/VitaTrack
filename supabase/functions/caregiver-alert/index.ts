/**
 * VitaTrack Edge Function: caregiver-alert
 *
 * Fires every 10 minutes via a Supabase cron schedule.
 * Finds doses that were scheduled > 30 min ago and are still pending,
 * then sends an Expo push notification to the patient's co-manager(s).
 *
 * Deploy:
 *   supabase functions deploy caregiver-alert --no-verify-jwt
 *
 * Cron (supabase/config.toml): runs every 10 minutes.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MISSED_THRESHOLD_MINUTES = 30
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface DoseRow {
  id: string
  medication_id: string
  profile_id: string
  scheduled_at: string
  status: string
  medication_name: string
  caregiver_token: string | null
  caregiver_name: string | null
  patient_name: string | null
}

serve(async (_req: Request) => {
  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const cutoff = new Date(Date.now() - MISSED_THRESHOLD_MINUTES * 60_000).toISOString()

  // Find overdue pending doses joined to family member push tokens
  const { data: overdueDoses, error } = await supabase
    .rpc('get_overdue_doses_for_caregiver', { cutoff_time: cutoff })

  if (error) {
    console.error('[caregiver-alert] RPC error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const doses = (overdueDoses ?? []) as DoseRow[]

  if (doses.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: 'No overdue doses' }), { status: 200 })
  }

  // Group by caregiver token to batch
  const byToken: Record<string, DoseRow[]> = {}
  for (const dose of doses) {
    if (!dose.caregiver_token) continue
    ;(byToken[dose.caregiver_token] ??= []).push(dose)
  }

  const pushMessages = Object.entries(byToken).flatMap(([token, tokenDoses]) => {
    // One notification per patient per caregiver (group multiple missed doses)
    const patientGroups: Record<string, DoseRow[]> = {}
    for (const d of tokenDoses) {
      ;(patientGroups[d.profile_id] ??= []).push(d)
    }

    return Object.entries(patientGroups).map(([profileId, patDoses]) => {
      const patientName = patDoses[0].patient_name ?? 'Patient'
      const count       = patDoses.length
      const medNames    = [...new Set(patDoses.map(d => d.medication_name))].join(', ')

      return {
        to:    token,
        title: `⚠️ Missed Dose — ${patientName}`,
        body:  count === 1
          ? `${patientName} missed their ${medNames} dose (${MISSED_THRESHOLD_MINUTES}+ min overdue).`
          : `${patientName} has ${count} missed doses: ${medNames}.`,
        data: {
          type:      'caregiver_missed_dose',
          profileId,
          doseIds:   patDoses.map(d => d.id),
        },
        sound:    'default',
        priority: 'high',
        channelId: 'vitatrack-remote',
      }
    })
  })

  // Send in batches of 100 (Expo limit)
  let totalSent = 0
  for (let i = 0; i < pushMessages.length; i += 100) {
    const batch = pushMessages.slice(i, i + 100)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('[caregiver-alert] Expo push error:', text)
      } else {
        totalSent += batch.length
      }
    } catch (e) {
      console.error('[caregiver-alert] Fetch error:', e)
    }
  }

  // Mark alerted doses so we don't re-send for the same event
  const alertedIds = doses.map(d => d.id)
  await supabase
    .from('dose_logs')
    .update({ caregiver_alerted_at: new Date().toISOString() })
    .in('id', alertedIds)

  return new Response(
    JSON.stringify({ sent: totalSent, overdueCount: doses.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
