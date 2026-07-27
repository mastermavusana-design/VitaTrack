/**
 * VitaTrack Edge Function: dose-materialize
 *
 * Cron job that turns active medication_schedules into `pending` dose_logs so
 * the caregiver-alert function has overdue doses to detect. It also reconciles
 * pending rows against the patient's actual logging and expires truly-missed
 * ones. All logic lives in the materialize_pending_doses() Postgres function;
 * this is a thin trigger.
 *
 * Deploy:
 *   supabase functions deploy dose-materialize --no-verify-jwt
 *
 * Cron (supabase/config.toml):
 *   [functions.dose-materialize]
 *   schedule = "*​/15 * * * *"
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.rpc('materialize_pending_doses')

  if (error) {
    console.error('[dose-materialize] RPC error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  // data => { reconciled, materialized, expired }
  return new Response(
    JSON.stringify({ ok: true, ...(data ?? {}) }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
