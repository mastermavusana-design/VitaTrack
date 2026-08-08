/**
 * GET  /api/dependants  — list the session guardian's (non-archived) children
 * POST /api/dependants  — create a child, then expand the immunisation +
 *                         milestone reference schedules into per-child rows
 *
 * Flag-off (/api) fallback for the child-health slice. When client-direct is ON
 * this route returns 410 (see apiRetired) and the browser writes the af-south-1
 * Data API directly under RLS. Validation mirrors the shared validateDependant
 * used on the client; DB CHECK + RLS remain the authority.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { retiredIfClientDirect } from '@/lib/apiRetired'
import {
  captureException,
  validateDependant,
  ACTIVE_VACCINE_SCHEDULE_VER,
  ACTIVE_MILESTONE_SCHEDULE_VER,
} from '@vitatrack/shared'

export async function GET() {
  const gone = retiredIfClientDirect(); if (gone) return gone
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('dependants')
    .select('*')
    .eq('guardian_id', user.id)
    .is('archived_at', null)
    .order('date_of_birth', { ascending: true })

  if (error) {
    captureException(error, { tags: { route: 'GET /api/dependants' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ dependants: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gone = retiredIfClientDirect(); if (gone) return gone
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const v = validateDependant({
    full_name:          body?.full_name,
    date_of_birth:      body?.date_of_birth,
    sex:                body?.sex,
    birth_weight_g:     body?.birth_weight_g,
    gestational_age_wk: body?.gestational_age_wk,
    popia_consent:      body?.popia_consent,
  })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data: child, error } = await supabase
    .from('dependants')
    .insert({
      guardian_id:        user.id,
      full_name:          String(body.full_name).trim(),
      date_of_birth:      body.date_of_birth,
      sex:                body.sex ?? null,
      birth_weight_g:     body.birth_weight_g ?? null,
      gestational_age_wk: body.gestational_age_wk ?? null,
      relationship:       body.relationship ?? null,
      rthb_number:        body.rthb_number ?? null,
      popia_consent:      true,
      popia_consent_at:   new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    captureException(error, { tags: { route: 'POST /api/dependants' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Expand the active reference schedules into per-child rows. Best-effort: the
  // child is already saved, so surface expansion issues without failing the whole
  // request (the guardian can re-run expansion from the child view later).
  const [imm, mil] = await Promise.all([
    supabase.rpc('expand_immunisation_schedule', { dep: child.id, ver: ACTIVE_VACCINE_SCHEDULE_VER }),
    supabase.rpc('expand_milestone_schedule',    { dep: child.id, ver: ACTIVE_MILESTONE_SCHEDULE_VER }),
  ])
  if (imm.error) captureException(imm.error, { tags: { route: 'POST /api/dependants (expand immunisations)' } })
  if (mil.error) captureException(mil.error, { tags: { route: 'POST /api/dependants (expand milestones)' } })

  return NextResponse.json({
    dependant: child,
    expanded: { immunisations: imm.data ?? 0, milestones: mil.data ?? 0 },
  }, { status: 201 })
}
