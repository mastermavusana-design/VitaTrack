/**
 * PATCH  /api/medications/[id]  — partial update (name, pill_count, is_active, etc.)
 * DELETE /api/medications/[id]  — archive (soft-delete: set archived_at + is_active=false)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { captureException } from '@vitatrack/shared'

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
  // Numeric coercions with non-negative validation
  for (const numField of ['pill_count', 'refill_threshold', 'strength'] as const) {
    if (numField in patch) {
      const raw = patch[numField]
      if (raw == null || raw === '') {
        patch[numField] = null
      } else {
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: `${numField} must be a non-negative number` }, { status: 400 })
        }
        patch[numField] = n
      }
    }
  }

  if ('name' in patch) {
    const name = typeof patch.name === 'string' ? patch.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    if (name.length > 200) return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    patch.name = name
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('medications')
    .update(patch)
    .eq('id', params.id)
    .select('id, name, is_active, pill_count')
    .single()

  if (error) {
    captureException(error, { tags: { route: 'PATCH /api/medications/[id]' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ medication: data })
}

export async function DELETE(
  _req: NextRequest,
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

  if (error) {
    captureException(error, { tags: { route: 'DELETE /api/medications/[id]' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
