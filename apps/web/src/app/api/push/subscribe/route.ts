/**
 * POST /api/push/subscribe — persist a Web Push subscription for the session user.
 * The full subscription JSON (endpoint + p256dh + auth) is stored in push_tokens.token
 * (UNIQUE), platform 'web'. Idempotent on the endpoint.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { retiredIfClientDirect } from '@/lib/apiRetired'
import { captureException } from '@vitatrack/shared'

export async function POST(req: NextRequest) {
  const gone = retiredIfClientDirect(); if (gone) return gone
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sub = body?.subscription
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 })
  }

  const token = JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys })

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        profile_id:   user.id,
        token,
        platform:     'web',
        device_name:  typeof body.device_name === 'string' ? body.device_name.slice(0, 120) : null,
        is_active:    true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    )

  if (error) {
    console.error('[POST /api/push/subscribe]', error)
    captureException(error, { tags: { route: 'POST /api/push/subscribe' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
