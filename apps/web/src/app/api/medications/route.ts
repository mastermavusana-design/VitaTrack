/**
 * GET  /api/medications          — list active medications for the session user
 * POST /api/medications          — create a new medication
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { captureException } from '@vitatrack/shared'

/** Coerce to a non-negative finite number, or return an error string. */
function nonNegative(value: unknown, field: string): { value: number | null } | { error: string } {
  if (value == null || value === '') return { value: null }
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return { error: `${field} must be a non-negative number` }
  return { value: n }
}

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
  if (error) {
    captureException(error, { tags: { route: 'GET /api/medications' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ medications: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }
  if (name.length > 200) {
    return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
  }

  const strength = nonNegative(body.strength, 'strength')
  if ('error' in strength) return NextResponse.json({ error: strength.error }, { status: 400 })
  const pillCount = nonNegative(body.pill_count, 'pill_count')
  if ('error' in pillCount) return NextResponse.json({ error: pillCount.error }, { status: 400 })
  const refillThreshold = nonNegative(body.refill_threshold, 'refill_threshold')
  if ('error' in refillThreshold) return NextResponse.json({ error: refillThreshold.error }, { status: 400 })

  const { data, error } = await supabase
    .from('medications')
    .insert({
      profile_id:       session.user.id,
      name,
      generic_name:     body.generic_name ?? null,
      form:             body.form ?? null,
      strength:         strength.value,
      strength_unit:    body.strength_unit    ?? null,
      instructions:     body.instructions     ?? null,
      prescriber:       body.prescriber       ?? null,
      pill_count:       pillCount.value,
      refill_threshold: refillThreshold.value,
      color:            body.color            ?? null,
      reminder_enabled: body.reminder_enabled ?? true,
      is_active:        true,
    })
    .select('id, name')
    .single()

  if (error) {
    console.error('[POST /api/medications]', error)
    captureException(error, { tags: { route: 'POST /api/medications' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ medication: data }, { status: 201 })
}
