/**
 * GET  /api/doctor-visits  — list the session user's doctor visits
 * POST /api/doctor-visits  — record a new doctor visit
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { captureException } from '@vitatrack/shared'

const VALID_VISIT_TYPES = ['gp', 'specialist', 'emergency', 'dentist', 'pharmacy', 'other']

export async function GET() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Resolve caregiver target
  let profileId = session.user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', session.user.id)
    .eq('status', 'accepted')
    .maybeSingle()
  if (membership) profileId = (membership as any).owner_id

  const { data, error } = await supabase
    .from('doctor_visits')
    .select('*')
    .eq('profile_id', profileId)
    .order('visit_date', { ascending: false })
    .limit(200)

  if (error) {
    captureException(error, { tags: { route: 'GET /api/doctor-visits' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ visits: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)

  const visitDate = typeof body?.visit_date === 'string' ? body.visit_date : ''
  if (!visitDate || Number.isNaN(new Date(visitDate).getTime())) {
    return NextResponse.json({ error: 'A valid visit_date is required' }, { status: 400 })
  }

  const visitType = typeof body.visit_type === 'string' && VALID_VISIT_TYPES.includes(body.visit_type)
    ? body.visit_type
    : 'other'

  const { data, error } = await supabase
    .from('doctor_visits')
    .insert({
      profile_id:     session.user.id,
      visit_date:     visitDate,
      visit_type:     visitType,
      provider_name:  body.provider_name?.trim() || body.doctor_name?.trim() || null,
      specialty:      body.specialty?.trim()    || null,
      facility:       body.facility?.trim()     || null,
      reason:         body.reason?.trim()       || null,
      diagnosis:      body.diagnosis?.trim()    || null,
      treatment:      body.treatment?.trim()    || null,
      follow_up_date: body.follow_up_date       || null,
      notes:          body.notes?.trim()        || null,
    })
    .select('id, visit_date, provider_name')
    .single()

  if (error) {
    console.error('[POST /api/doctor-visits]', error)
    captureException(error, { tags: { route: 'POST /api/doctor-visits' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ visit: data }, { status: 201 })
}
