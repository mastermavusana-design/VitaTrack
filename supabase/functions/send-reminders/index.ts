/**
 * VitaTrack Edge Function: send-reminders  (R1 Phase D / R4)
 *
 * In-region (af-south-1) replacement for the Vercel cron `/api/cron/reminders`.
 * Sends **Web Push** (browser) reminders for due medication doses + a daily refill
 * sweep, reading medication_schedules in each profile's timezone and pushing to the
 * `push_tokens` (platform='web') subscriptions. Mobile/Expo reminders continue to be
 * handled by refill-daily / caregiver-alert; this function only does web push.
 *
 * Why this exists: the Vercel cron ran on Vercel (EU) and processed SA health data
 * outside af-south-1. This runs as a Supabase Edge Function next to the Data API.
 *
 * Deploy:
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:support@vitatrack.app
 *   supabase functions deploy send-reminders --no-verify-jwt
 *
 * Cron (supabase/config.toml):
 *   [functions.send-reminders]
 *   schedule = "* /5 * * * *"   // every 5 minutes — must match WINDOW_MIN
 *
 * NOTE: uses the `npm:` specifier (Supabase Edge runtime supports npm compat).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const WINDOW_MIN = 5 // must match the cron cadence

/** Current minute-of-day (0..1439) in a given IANA timezone. */
function minuteOfDayInTz(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
    return (h % 24) * 60 + m
  } catch {
    return -1
  }
}

function toMinute(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), { status: 500 })
  }
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:support@vitatrack.app', publicKey, privateKey)

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const now = new Date()

  // Active, reminder-enabled schedules + their medication + owner.
  const { data: schedules, error } = await supabase
    .from('medication_schedules')
    .select('profile_id, times, reminder_enabled, medication:medications(name, strength, strength_unit, is_active, reminder_enabled, pill_count, refill_threshold)')
    .eq('is_active', true)
    .eq('reminder_enabled', true)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const rows = (schedules ?? []).filter((s: any) => s.medication?.is_active && s.medication?.reminder_enabled !== false)
  const profileIds = Array.from(new Set(rows.map((s: any) => s.profile_id)))
  if (profileIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, due: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // Timezones + web subscriptions for those profiles.
  const [{ data: profiles }, { data: tokens }] = await Promise.all([
    supabase.from('profiles').select('id, timezone').in('id', profileIds),
    supabase.from('push_tokens').select('id, profile_id, token').eq('platform', 'web').eq('is_active', true).in('profile_id', profileIds),
  ])

  const tzOf = new Map<string, string>((profiles ?? []).map((p: any) => [p.id, p.timezone || 'Africa/Johannesburg']))
  const subsOf = new Map<string, { id: string; sub: any }[]>()
  for (const t of tokens ?? []) {
    try {
      const sub = JSON.parse((t as any).token)
      if (!sub?.endpoint) continue
      const list = subsOf.get((t as any).profile_id) ?? []
      list.push({ id: (t as any).id, sub })
      subsOf.set((t as any).profile_id, list)
    } catch { /* skip malformed */ }
  }

  // Build the set of notifications to send.
  type Msg = { profileId: string; title: string; body: string; tag: string }
  const messages: Msg[] = []
  const refilledFor = new Set<string>()

  for (const s of rows as any[]) {
    const tz = tzOf.get(s.profile_id) ?? 'Africa/Johannesburg'
    const nowMin = minuteOfDayInTz(now, tz)
    if (nowMin < 0) continue
    const med = s.medication
    const label = `${med.name}${med.strength ? ` ${med.strength}${med.strength_unit ?? ''}` : ''}`

    for (const time of s.times ?? []) {
      const tMin = toMinute(time)
      if (tMin == null) continue
      const delta = nowMin - tMin
      if (delta >= 0 && delta < WINDOW_MIN) {
        messages.push({ profileId: s.profile_id, title: 'Time for your medication', body: `${label} — due at ${time}`, tag: `dose-${s.profile_id}-${time}` })
      }
    }

    // Daily refill sweep at 07:00 local.
    if (nowMin >= 420 && nowMin < 420 + WINDOW_MIN) {
      const key = `${s.profile_id}-${med.name}`
      if (!refilledFor.has(key) && med.pill_count != null && med.refill_threshold != null && med.pill_count <= med.refill_threshold) {
        refilledFor.add(key)
        messages.push({ profileId: s.profile_id, title: 'Refill soon', body: `${label}: ${med.pill_count} left`, tag: `refill-${key}` })
      }
    }
  }

  // Send.
  let sent = 0
  const staleTokenIds: string[] = []
  await Promise.all(messages.map(async (msg) => {
    const subs = subsOf.get(msg.profileId) ?? []
    const payload = JSON.stringify({ title: msg.title, body: msg.body, tag: msg.tag, url: '/dashboard/medications' })
    await Promise.all(subs.map(async ({ id, sub }) => {
      try {
        await webpush.sendNotification(sub, payload)
        sent++
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) staleTokenIds.push(id)
      }
    }))
  }))

  if (staleTokenIds.length) {
    await supabase.from('push_tokens').delete().in('id', staleTokenIds)
  }

  return new Response(
    JSON.stringify({ due: messages.length, sent, pruned: staleTokenIds.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
