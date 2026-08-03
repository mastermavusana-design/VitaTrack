/**
 * GET   /api/profile  — fetch the session user's profile
 * PATCH /api/profile  — update profile fields
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { captureException, BLOOD_TYPES } from '@vitatrack/shared'

export async function GET() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    captureException(error, { tags: { route: 'GET /api/profile' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ profile: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  const allowed = [
    'full_name', 'date_of_birth', 'blood_type', 'phone',
    'avatar_url', 'preferred_units', 'timezone',
  ]
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // ── Value-level validation ──
  if ('blood_type' in patch && patch.blood_type != null) {
    if (!(BLOOD_TYPES as readonly string[]).includes(String(patch.blood_type))) {
      return NextResponse.json(
        { error: `blood_type must be one of: ${BLOOD_TYPES.join(', ')}` },
        { status: 400 },
      )
    }
  }
  if ('date_of_birth' in patch && patch.date_of_birth != null) {
    const dob = new Date(String(patch.date_of_birth))
    if (Number.isNaN(dob.getTime())) {
      return NextResponse.json({ error: 'date_of_birth must be a valid date' }, { status: 400 })
    }
    if (dob.getTime() > Date.now()) {
      return NextResponse.json({ error: 'date_of_birth cannot be in the future' }, { status: 400 })
    }
  }
  if ('full_name' in patch && typeof patch.full_name === 'string' && patch.full_name.length > 200) {
    return NextResponse.json({ error: 'full_name must be 200 characters or fewer' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('id, full_name, blood_type, preferred_units, timezone')
    .single()

  if (error) {
    captureException(error, { tags: { route: 'PATCH /api/profile' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ profile: data })
}
