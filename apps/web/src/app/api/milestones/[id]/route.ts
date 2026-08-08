/**
 * PATCH /api/milestones/[id]  — update a milestone's status (achieved / concern / reset)
 *
 * Flag-off (/api) fallback for the milestone write surface. When client-direct is
 * ON this returns 410 and the browser writes the af-south-1 Data API directly
 * under RLS. Guardian-CRUD RLS on milestones is the authority.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { retiredIfClientDirect } from '@/lib/apiRetired'
import { captureException, isMilestoneStatus, isISODate } from '@vitatrack/shared'

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
    if (!isMilestoneStatus(body.status)) {
      return NextResponse.json({ error: "status must be one of 'not_yet','achieved','concern'" }, { status: 400 })
    }
    patch.status = body.status
    // Set achieved_on to today when achieving (unless caller supplied one); clear otherwise.
    if (body.status === 'achieved') {
      const on = body.achieved_on ?? TODAY()
      if (!isISODate(on) || on > TODAY()) {
        return NextResponse.json({ error: 'achieved_on must be a valid, non-future date' }, { status: 400 })
      }
      patch.achieved_on = on
    } else {
      patch.achieved_on = null
    }
  } else if (body.achieved_on !== undefined) {
    if (body.achieved_on !== null && !isISODate(body.achieved_on)) {
      return NextResponse.json({ error: 'achieved_on must be a valid date' }, { status: 400 })
    }
    patch.achieved_on = body.achieved_on
  }

  if (body.notes !== undefined) patch.notes = body.notes === '' ? null : body.notes

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('milestones')
    .update(patch)
    .eq('id', params.id)        // RLS restricts to the guardian's own child
    .select('*')
    .maybeSingle()

  if (error) {
    captureException(error, { tags: { route: 'PATCH /api/milestones/[id]' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ milestone: data })
}
