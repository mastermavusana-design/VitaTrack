/**
 * GET /api/cron/reminders — Web Push reminder sender (Vercel Cron, every 5 min).
 *
 * Computes due medication doses directly from medication_schedules in each
 * profile's timezone, plus a daily refill sweep at 07:00 local, and pushes to
 * every registered web subscription. Runs with the service role (all users).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET
 * is set. Requests without it are rejected.
 */
import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WINDOW_MIN = 5 // must match the cron cadence

/** Current minute-of-day (0..1439) in a given IANA timezone. */
function minuteOfDayInTz(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
    const h = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
    const m = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@vitatrack.app', publicKey, privateKey)

  const supabase = createServiceClient()
  const now = new Date()

  // Active, reminder-enabled schedules + their medication + owner.
  const { data: schedules, error } = await supabase
    .from('medication_schedules')
    .select('profile_id, times, reminder_enabled, medication:medications(name, strength, strength_unit, is_active, reminder_enabled, pill_count, refill_threshold)')
    .eq('is_active', true)
    .eq('reminder_enabled', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (schedules ?? []).filter((s: any) => s.medication?.is_active && s.medication?.reminder_enabled !== false)
  const profileIds = Array.from(new Set(rows.map((s: any) => s.profile_id)))
  if (profileIds.length === 0) return NextResponse.json({ sent: 0, due: 0 })

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

  return NextResponse.json({ due: messages.length, sent, pruned: staleTokenIds.length })
}
