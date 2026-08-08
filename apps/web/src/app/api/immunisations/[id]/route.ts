/**
 * PATCH /api/immunisations/[id]  — update a dose's status / administration detail
 *
 * Flag-off (/api) fallback for the immunisation write surface (mark given, skip,
 * undo). When client-direct is ON this returns 410 and the browser writes the
 * af-south-1 Data API directly under RLS. Guardian-CRUD RLS on immunisations is
 * the authority; this only shapes + validates the patch.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { retiredIfClientDirect } from '@/lib/apiRetired'
import { captureException, isImmunisationStatus, isISODate } from '@vitatrack/shared'

const TODAY = () => new Date().toISOString().slice(0, 10)

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gone = retiredIfClientDirect(); if (gone) return gone
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const patch: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!isImmunisationStatus(body.status)) {
      return NextResponse.json({ error: "status must be one of 'due','given','skipped','contraindicated'" }, { status: 400 })
    }
    patch.status = body.status
    if (body.status === 'given') {
      const given = body.given_date ?? TODAY()
      if (!isISODate(given) || given > TODAY()) {
        return NextResponse.json({ error: 'given_date must be a valid, non-future date' }, { status: 400 })
      }
      patch.given_date = given
    } else if (body.status === 'due') {
      patch.given_date = null   // undo clears the administration date
    }
  }

  // Optional administration detail.
  for (const f of ['batch_lot', 'site', 'facility', 'administered_by', 'notes'] as const) {
    if (body[f] !== undefined) patch[f] = body[f] === '' ? null : body[f]
  }
  if (body.given_date !== undefined && patch.given_date === undefined) {
    if (body.given_date !== null && !isISODate(body.given_date)) {
      return NextResponse.json({ error: 'given_date must be a valid date' }, { status: 400 })
    }
    patch.given_date = body.given_date
  }
  if (body.reminder_enabled !== undefined) patch.reminder_enabled = !!body.reminder_enabled

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('immunisations')
    .update(patch)
    .eq('id', params.id)        // RLS restricts to the guardian's own child
    .select('*')
    .maybeSingle()

  if (error) {
    captureException(error, { tags: { route: 'PATCH /api/immunisations/[id]' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ immunisation: data })
}
