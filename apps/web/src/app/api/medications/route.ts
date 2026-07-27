/**
 * GET  /api/medications          — list active medications for the session user
 * POST /api/medications          — create a new medication
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const includeInactive = searchParams.get('includeInactive') === 'true'

  // Resolve caregiver target
  let profileId = session.user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', session.user.id)
    .eq('status', 'accepted')
    .maybeSingle()
  if (membership) profileId = (membership as any).owner_id

  let query = supabase
    .from('medications')
    .select('*, schedules:medication_schedules(*)')
    .eq('profile_id', profileId)
    .order('name')

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ medications: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('medications')
    .insert({
      profile_id:       session.user.id,
      name:             body.name.trim(),
      generic_name:     body.generic_name ?? null,
      form:             body.form ?? null,
      strength:         body.strength         ? Number(body.strength) : null,
      strength_unit:    body.strength_unit    ?? null,
      instructions:     body.instructions     ?? null,
      prescriber:       body.prescriber       ?? null,
      pill_count:       body.pill_count       ? Number(body.pill_count) : null,
      refill_threshold: body.refill_threshold ? Number(body.refill_threshold) : null,
      color:            body.color            ?? null,
      reminder_enabled: body.reminder_enabled ?? true,
      is_active:        true,
    })
    .select('id, name')
    .single()

  if (error) {
    console.error('[POST /api/medications]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ medication: data }, { status: 201 })
}
