/**
 * GET   /api/ice  — fetch the session user's ICE (emergency) profile
 * PUT   /api/ice  — create or update (upsert) the ICE profile
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { captureException } from '@vitatrack/shared'

export async function GET() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('ice_profiles')
    .select('*')
    .eq('profile_id', session.user.id)
    .maybeSingle()

  if (error) {
    captureException(error, { tags: { route: 'GET /api/ice' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ice: data })
}

/** Normalise a comma/newline separated string or array into a clean string[]. */
function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
  return []
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Emergency contacts arrive as [{ name, relationship, phone }]
  const contacts = Array.isArray(body.emergency_contacts)
    ? body.emergency_contacts
        .filter((c: any) => c && (c.name || c.phone))
        .map((c: any) => ({
          name: String(c.name ?? '').trim(),
          relationship: String(c.relationship ?? '').trim(),
          phone: String(c.phone ?? '').trim(),
        }))
    : []

  const payload = {
    profile_id:          session.user.id,
    blood_type:          body.blood_type || null,
    allergies:           toArray(body.allergies),
    conditions:          toArray(body.conditions),
    current_medications: toArray(body.current_medications),
    emergency_contacts:  contacts,
    organ_donor:         body.organ_donor ?? null,
    do_not_resuscitate:  body.do_not_resuscitate ?? false,
    additional_notes:    body.additional_notes?.trim() || null,
    is_public:           body.is_public ?? true,
  }

  const { data, error } = await supabase
    .from('ice_profiles')
    .upsert(payload, { onConflict: 'profile_id' })
    .select('*')
    .single()

  if (error) {
    console.error('[PUT /api/ice]', error)
    captureException(error, { tags: { route: 'PUT /api/ice' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ice: data })
}
