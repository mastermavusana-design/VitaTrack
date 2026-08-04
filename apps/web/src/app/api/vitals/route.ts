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
import { retiredIfClientDirect } from '@/lib/apiRetired'
import {
  captureException,
  validateBloodPressure,
  validateGlucose,
  validateWeight,
  validateTemperature,
  validateSpo2,
  validateHeartRate,
  validatePulse,
  type GlucoseUnit,
  type WeightUnit,
  type TempUnit,
} from '@vitatrack/shared'

export async function POST(req: NextRequest) {
  const gone = retiredIfClientDirect(); if (gone) return gone
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
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
  const VALID_SOURCE = ['manual', 'scan', 'qr', 'import']
  const payload: Record<string, unknown> = {
    profile_id:  user.id,
    type:        body.type,
    recorded_at: body.recorded_at ?? new Date().toISOString(),
    device:      body.device ?? null,
    notes:       body.notes ?? null,
    source:      VALID_SOURCE.includes(body.source) ? body.source : 'manual',
    capture_id:  body.capture_id ?? null,
  }

  switch (body.type) {
    case 'blood_pressure': {
      if (body.systolic == null || body.diastolic == null) {
        return NextResponse.json({ error: 'Blood pressure requires systolic and diastolic' }, { status: 400 })
      }
      const systolic = Number(body.systolic)
      const diastolic = Number(body.diastolic)
      const check = validateBloodPressure(systolic, diastolic)
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
      if (body.pulse != null) {
        const p = validatePulse(Number(body.pulse))
        if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 })
      }
      payload.systolic    = systolic
      payload.diastolic   = diastolic
      payload.pulse       = body.pulse != null ? Number(body.pulse) : null
      payload.arm         = body.arm         ?? null
      payload.bp_position = body.bp_position ?? null
      break
    }

    case 'glucose': {
      if (body.glucose_value == null) {
        return NextResponse.json({ error: 'Glucose requires glucose_value' }, { status: 400 })
      }
      const unit = (body.glucose_unit ?? 'mmol/L') as GlucoseUnit
      const check = validateGlucose(Number(body.glucose_value), unit)
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
      payload.glucose_value = Number(body.glucose_value)
      payload.glucose_unit  = unit
      payload.meal_context  = body.meal_context  ?? null
      break
    }

    case 'weight': {
      if (body.weight_value == null) {
        return NextResponse.json({ error: 'Weight requires weight_value' }, { status: 400 })
      }
      const unit = (body.weight_unit ?? 'kg') as WeightUnit
      const check = validateWeight(Number(body.weight_value), unit)
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
      payload.weight_value = Number(body.weight_value)
      payload.weight_unit  = unit
      break
    }

    case 'temperature': {
      if (body.temp_value == null) {
        return NextResponse.json({ error: 'Temperature requires temp_value' }, { status: 400 })
      }
      const unit = (body.temp_unit ?? '°C') as TempUnit
      const check = validateTemperature(Number(body.temp_value), unit)
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
      payload.temp_value = Number(body.temp_value)
      payload.temp_unit  = unit
      break
    }

    case 'spo2': {
      if (body.spo2_value == null) {
        return NextResponse.json({ error: 'SpO2 requires spo2_value' }, { status: 400 })
      }
      const check = validateSpo2(Number(body.spo2_value))
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
      payload.spo2_value = Number(body.spo2_value)
      break
    }

    case 'heart_rate': {
      if (body.heart_rate == null) {
        return NextResponse.json({ error: 'Heart rate requires heart_rate' }, { status: 400 })
      }
      const check = validateHeartRate(Number(body.heart_rate))
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
      payload.heart_rate = Number(body.heart_rate)
      break
    }
  }

  const { data, error } = await supabase
    .from('vitals')
    .insert(payload)
    .select('id, type, recorded_at')
    .single()

  if (error) {
    console.error('[POST /api/vitals]', error)
    captureException(error, { tags: { route: 'POST /api/vitals', type: String(body.type) } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ vital: data }, { status: 201 })
}

/**
 * GET /api/vitals?type=blood_pressure&days=30&limit=100
 * Returns vitals for the authenticated user (or their owner if caregiver).
 */
export async function GET(req: NextRequest) {
  const gone = retiredIfClientDirect(); if (gone) return gone
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type  = searchParams.get('type') ?? 'blood_pressure'
  const days  = parseInt(searchParams.get('days') ?? '30', 10)
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)

  // Resolve profile (caregiver → owner)
  let profileId = user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', user.id)
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

  if (error) {
    captureException(error, { tags: { route: 'GET /api/vitals' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ vitals: data ?? [] })
}
