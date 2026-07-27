/**
 * PATCH  /api/medications/[id]  — partial update (name, pill_count, is_active, etc.)
 * DELETE /api/medications/[id]  — archive (soft-delete: set archived_at + is_active=false)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Verify ownership
  const { data: med } = await supabase
    .from('medications')
    .select('id, profile_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!med) return NextResponse.json({ error: 'Medication not found' }, { status: 404 })
  if (med.profile_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Build update — only allow safe fields to be patched
  const allowed = [
    'name', 'generic_name', 'form', 'strength', 'strength_unit',
    'instructions', 'prescriber', 'pill_count', 'refill_threshold',
    'color', 'reminder_enabled', 'is_active',
  ]
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }
  // Numeric coercions
  if ('pill_count'       in patch) patch.pill_count       = patch.pill_count       ? Number(patch.pill_count)       : null
  if ('refill_threshold' in patch) patch.refill_threshold = patch.refill_threshold ? Number(patch.refill_threshold) : null
  if ('strength'         in patch) patch.strength         = patch.strength         ? Number(patch.strength)         : null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('medications')
    .update(patch)
    .eq('id', params.id)
    .select('id, name, is_active, pill_count')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ medication: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: med } = await supabase
    .from('medications')
    .select('id, profile_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!med) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (med.profile_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Soft-delete: archive instead of hard delete (preserves dose log history)
  const { error } = await supabase
    .from('medications')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
