/**
 * POST /api/scan-captures — record one scan attempt (audit/provenance trail).
 * The raw image is never persisted; only a structured extract + confidence.
 * Returns the capture id so the caller can attach it to the saved vital/document.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { captureException } from '@vitatrack/shared'

const VALID_ARTIFACT = ['device_screen', 'lab_report', 'prescription', 'document', 'qr']
const VALID_METHOD = ['on_device', 'cloud', 'qr']
const VALID_STATUS = ['reviewed', 'discarded', 'failed']

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)

  const artifact = VALID_ARTIFACT.includes(body?.artifact) ? body.artifact : 'document'
  const method = VALID_METHOD.includes(body?.method) ? body.method : 'on_device'
  const status = VALID_STATUS.includes(body?.status) ? body.status : 'reviewed'

  const { data, error } = await supabase
    .from('scan_captures')
    .insert({
      profile_id:   user.id,
      artifact,
      method,
      engine:       typeof body?.engine === 'string' ? body.engine.slice(0, 120) : null,
      raw_extract:  body?.raw_extract ?? null,
      overall_conf: typeof body?.overall_conf === 'number' ? body.overall_conf : null,
      status,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[POST /api/scan-captures]', error)
    captureException(error, { tags: { route: 'POST /api/scan-captures' } })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ capture: data }, { status: 201 })
}
