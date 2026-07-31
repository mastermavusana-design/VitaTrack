/**
 * GET  /api/documents  — list the session user's health documents
 * POST /api/documents  — save metadata for a document already uploaded to the
 *                        `health-documents` storage bucket (path: {uid}/{ts}_{name}).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { captureException } from '@vitatrack/shared'

const VALID_CATEGORIES = ['prescription', 'lab_result', 'imaging', 'insurance', 'hospital', 'other']

export async function GET() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let profileId = session.user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', session.user.id)
    .eq('status', 'accepted')
    .maybeSingle()
  if (membership) profileId = (membership as any).owner_id

  const { data, error } = await supabase
    .from('health_documents')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    captureException(error, { tags: { route: 'GET /api/documents' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ documents: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)

  const fileName = typeof body?.file_name === 'string' ? body.file_name.trim() : ''
  const storagePath = typeof body?.storage_path === 'string' ? body.storage_path : ''
  if (!fileName || !storagePath) {
    return NextResponse.json({ error: 'file_name and storage_path are required' }, { status: 400 })
  }
  // Storage path must live under the caller's own folder (matches bucket RLS).
  if (!storagePath.startsWith(`${session.user.id}/`)) {
    return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 })
  }

  const category = VALID_CATEGORIES.includes(body.category) ? body.category : 'other'

  const { data, error } = await supabase
    .from('health_documents')
    .insert({
      profile_id:      session.user.id,
      visit_id:        body.visit_id || null,
      category,
      file_name:       fileName,
      file_type:       body.file_type || null,
      storage_path:    storagePath,
      file_size_bytes: body.file_size_bytes ?? null,
      original_name:   body.original_name || fileName,
      notes:           body.notes?.trim() || null,
    })
    .select('id, file_name, category')
    .single()

  if (error) {
    console.error('[POST /api/documents]', error)
    captureException(error, { tags: { route: 'POST /api/documents' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ document: data }, { status: 201 })
}
