/**
 * GET  /api/growth-measurements?dependant=<id>  — list a child's growth measurements
 * POST /api/growth-measurements                 — add a growth measurement
 *
 * Flag-off (/api) fallback. When client-direct is ON this returns 410 and the
 * browser writes the af-south-1 Data API directly under RLS. Guardian/family
 * visibility is enforced by RLS on growth_measurements (dependant-scoped).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { retiredIfClientDirect } from '@/lib/apiRetired'
import { captureException, validateGrowthMeasurement } from '@vitatrack/shared'

export async function GET(req: NextRequest) {
  const gone = retiredIfClientDirect(); if (gone) return gone
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const dependant = new URL(req.url).searchParams.get('dependant')
  if (!dependant) return NextResponse.json({ error: 'Missing dependant id' }, { status: 400 })

  const { data, error } = await supabase
    .from('growth_measurements')
    .select('*')
    .eq('dependant_id', dependant)      // RLS restricts to visible children
    .order('measured_at', { ascending: true })

  if (error) {
    captureException(error, { tags: { route: 'GET /api/growth-measurements' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ measurements: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gone = retiredIfClientDirect(); if (gone) return gone
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.dependant_id) return NextResponse.json({ error: 'Missing dependant_id' }, { status: 400 })

  const v = validateGrowthMeasurement({
    measured_at:  body?.measured_at,
    weight_kg:    body?.weight_kg,
    length_cm:    body?.length_cm,
    head_circ_cm: body?.head_circ_cm,
    muac_cm:      body?.muac_cm,
    source:       body?.source,
  })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await supabase
    .from('growth_measurements')
    .insert({
      dependant_id: body.dependant_id,   // RLS WITH CHECK requires an owned child
      measured_at:  body.measured_at,
      weight_kg:    body.weight_kg ?? null,
      length_cm:    body.length_cm ?? null,
      head_circ_cm: body.head_circ_cm ?? null,
      muac_cm:      body.muac_cm ?? null,
      source:       'manual',
      notes:        body.notes ?? null,
    })
    .select('*')
    .single()

  if (error) {
    captureException(error, { tags: { route: 'POST /api/growth-measurements' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ measurement: data }, { status: 201 })
}
