/**
 * POST /api/vitals — log a new vital reading
 * Authenticated; inserts on behalf of the session user.
 *
 * Body:
 *   type          VitalType
 *   recorded_at   ISO string (optional, defaults to now)
 *   + type-specific fields (systolic/diastolic, glucose_value, etc.)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || !body.type) {
    return NextResponse.json({ error: 'Missing required field: type' }, { status: 400 })
  }

  const VALID_TYPES = ['blood_pressure', 'glucose', 'weight', 'temperature', 'spo2', 'heart_rate']
  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  // Build insert payload — only include fields for the given type
  const payload: Record<string, unknown> = {
    profile_id:  session.user.id,
    type:        body.type,
    recorded_at: body.recorded_at ?? new Date().toISOString(),
    device:      body.device ?? null,
    notes:       body.notes ?? null,
  }

  switch (body.type) {
    case 'blood_pressure':
      if (!body.systolic || !body.diastolic) {
        return NextResponse.json({ error: 'Blood pressure requires systolic and diastolic' }, { status: 400 })
      }
      payload.systolic    = Number(body.systolic)
      payload.diastolic   = Number(body.diastolic)
      payload.pulse       = body.pulse       ? Number(body.pulse)       : null
      payload.arm         = body.arm         ?? null
      payload.bp_position = body.bp_position ?? null
      break

    case 'glucose':
      if (!body.glucose_value) {
        return NextResponse.json({ error: 'Glucose requires glucose_value' }, { status: 400 })
      }
      payload.glucose_value = Number(body.glucose_value)
      payload.glucose_unit  = body.glucose_unit  ?? 'mmol/L'
      payload.meal_context  = body.meal_context  ?? null
      break

    case 'weight':
      if (!body.weight_value) {
        return NextResponse.json({ error: 'Weight requires weight_value' }, { status: 400 })
      }
      payload.weight_value = Number(body.weight_value)
      payload.weight_unit  = body.weight_unit  ?? 'kg'
      break

    case 'temperature':
      if (!body.temp_value) {
        return NextResponse.json({ error: 'Temperature requires temp_value' }, { status: 400 })
      }
      payload.temp_value = Number(body.temp_value)
      payload.temp_unit  = body.temp_unit ?? '°C'
      break

    case 'spo2':
      if (!body.spo2_value) {
        return NextResponse.json({ error: 'SpO2 requires spo2_value' }, { status: 400 })
      }
      payload.spo2_value = Number(body.spo2_value)
      break

    case 'heart_rate':
      if (!body.heart_rate) {
        return NextResponse.json({ error: 'Heart rate requires heart_rate' }, { status: 400 })
      }
      payload.heart_rate = Number(body.heart_rate)
      break
  }

  const { data, error } = await supabase
    .from('vitals')
    .insert(payload)
    .select('id, type, recorded_at')
    .single()

  if (error) {
    console.error('[POST /api/vitals]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ vital: data }, { status: 201 })
}

/**
 * GET /api/vitals?type=blood_pressure&days=30&limit=100
 * Returns vitals for the authenticated user (or their owner if caregiver).
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type  = searchParams.get('type') ?? 'blood_pressure'
  const days  = parseInt(searchParams.get('days') ?? '30', 10)
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)

  // Resolve profile (caregiver → owner)
  let profileId = session.user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', session.user.id)
    .eq('status', 'accepted')
    .maybeSingle()
  if (membership) profileId = (membership as any).owner_id

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { data, error } = await supabase
    .from('vitals')
    .select('*')
    .eq('profile_id', profileId)
    .eq('type', type)
    .gte('recorded_at', cutoff.toISOString())
    .order('recorded_at', { ascending: false })
    .limit(Math.min(limit, 500))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ vitals: data ?? [] })
}
