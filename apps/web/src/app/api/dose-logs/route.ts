/**
 * POST /api/dose-logs  — log a dose (taken | missed | skipped)
 * GET  /api/dose-logs?days=30&medication_id=xxx  — fetch dose history
 *
 * Used by the web dashboard to display and update adherence.
 * Dose loggers (caregivers with dose_logger role) can also POST for the owner.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { captureException } from '@vitatrack/shared'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.medication_id || !body?.status) {
    return NextResponse.json({ error: 'medication_id and status are required' }, { status: 400 })
  }

  const VALID_STATUSES = ['taken', 'missed', 'skipped']
  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  // Resolve profile: if caregiver, log on behalf of owner
  let profileId  = user.id
  let loggedById = user.id

  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id, role')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle()

  if (membership) {
    if (membership.role !== 'dose_logger') {
      return NextResponse.json(
        { error: 'You have viewer access only. Dose Logger role required to log doses.' },
        { status: 403 },
      )
    }
    profileId = (membership as any).owner_id
  }

  // Verify the medication belongs to this profile
  const { data: med } = await supabase
    .from('medications')
    .select('id, profile_id')
    .eq('id', body.medication_id)
    .maybeSingle()

  if (!med || med.profile_id !== profileId) {
    return NextResponse.json({ error: 'Medication not found or access denied' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('dose_logs')
    .insert({
      medication_id: body.medication_id,
      profile_id:    profileId,
      logged_by:     loggedById,
      status:        body.status,
      scheduled_at:  body.scheduled_at ?? null,
      logged_at:     body.logged_at    ?? new Date().toISOString(),
      notes:         body.notes        ?? null,
    })
    .select('id, status, logged_at')
    .single()

  if (error) {
    console.error('[POST /api/dose-logs]', error)
    captureException(error, { tags: { route: 'POST /api/dose-logs', status: String(body.status) } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ dose_log: data }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days           = parseInt(searchParams.get('days') ?? '30', 10)
  const medicationId   = searchParams.get('medication_id') ?? null

  // Resolve target profile
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

  let query = supabase
    .from('dose_logs')
    .select('*, medication:medications(name, color, form)')
    .eq('profile_id', profileId)
    .gte('logged_at', cutoff.toISOString())
    .order('logged_at', { ascending: false })
    .limit(500)

  if (medicationId) {
    query = query.eq('medication_id', medicationId)
  }

  const { data, error } = await query
  if (error) {
    captureException(error, { tags: { route: 'GET /api/dose-logs' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ dose_logs: data ?? [] })
}
