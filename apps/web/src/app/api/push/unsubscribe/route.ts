/**
 * POST /api/push/unsubscribe — deactivate the caller's Web Push subscription
 * matching the given endpoint.
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
  const endpoint = body?.endpoint
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })

  // Match the stored subscription JSON by endpoint for this user.
  const { data: rows } = await supabase
    .from('push_tokens')
    .select('id, token')
    .eq('profile_id', user.id)
    .eq('platform', 'web')

  const match = (rows ?? []).find((r: any) => {
    try { return JSON.parse(r.token)?.endpoint === endpoint } catch { return false }
  })
  if (!match) return NextResponse.json({ ok: true })

  const { error } = await supabase.from('push_tokens').delete().eq('id', match.id)
  if (error) {
    captureException(error, { tags: { route: 'POST /api/push/unsubscribe' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
