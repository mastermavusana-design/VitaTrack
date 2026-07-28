/**
 * VitaTrack Edge Function: extract-reading
 *
 * The cloud path of the camera-capture feature. Takes a photo of a medical
 * artifact and returns a structured ExtractionResult (fields + confidences).
 * Used for the artifacts on-device OCR can't handle well: lab reports,
 * prescriptions, multi-field documents. Device screens use the on-device
 * path and never reach this function.
 *
 * POPIA posture (see docs/features/camera-capture-spec.md §3.2):
 *   - Runs in the af-south-1 project; the vision model MUST be an in-region
 *     endpoint (see VisionProvider).
 *   - The raw image is processed in memory and NEVER persisted here.
 *   - The model is instructed to return only what it can read, each field
 *     with a confidence, and to NEVER invent a plausible value.
 *
 * Deploy:
 *   supabase functions deploy extract-reading
 *
 * Request  (POST, user JWT): { artifact, imageBase64, mimeType }
 * Response: ExtractionResult (packages/shared/src/capture/types.ts)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { BedrockRuntimeClient, InvokeModelCommand } from 'npm:@aws-sdk/client-bedrock-runtime@3'

type Artifact = 'lab_report' | 'prescription' | 'document'

interface ExtractRequest {
  artifact: Artifact
  imageBase64: string
  mimeType: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// ── Artifact-specific extraction prompts ─────────────────────
// Strict-JSON, confidence-per-field, never-guess. The exact schema the
// model must return mirrors ExtractionResult in the shared package.
const PROMPTS: Record<Artifact, string> = {
  lab_report: `You are reading a medical LABORATORY RESULT report. Extract every analyte you can
see into JSON: { "labs": [ { "analyte": {"value","confidence","raw"},
"value": {"value","confidence","raw"}, "unit": {...}, "refLow": {...}, "refHigh": {...} } ],
"recordedAt": {...}, "warnings": [] }. confidence is "high"|"medium"|"low". If you cannot read a
field, set value to null and confidence "low". NEVER guess a number. Report glare/blur in warnings.`,

  prescription: `You are reading a medical PRESCRIPTION. Extract into JSON:
{ "medication": { "name": {"value","confidence","raw"}, "strength": {...}, "dose": {...},
"frequency": {...} }, "warnings": [] }. If handwriting is unclear, lower the confidence and keep the
raw text; NEVER invent a drug name or dose.`,

  document: `You are reading a medical DOCUMENT (imaging/radiology report, discharge summary,
receipt). Do NOT interpret any image or make a diagnosis. Extract only metadata into JSON:
{ "document": { "category": {...}, "provider": {...}, "date": {...}, "title": {...} },
"warnings": [] }.`,
}

// ── VisionProvider seam ──────────────────────────────────────
// The ONE place the vendor lives. Swap this to the procured in-region
// model without touching anything else. The prototype ships a deterministic
// mock so the whole flow runs before a key exists.
interface VisionProvider {
  id: string
  extract(prompt: string, imageBase64: string, mimeType: string): Promise<Record<string, unknown>>
}

const mockProvider: VisionProvider = {
  id: 'mock-vision@0',
  // deno-lint-ignore require-await
  async extract(_prompt, _imageBase64, _mimeType) {
    // Deterministic placeholder so scan → review → save works end-to-end in dev.
    return {
      labs: [
        { analyte: { value: 'HbA1c', confidence: 'high', raw: 'HbA1c' },
          value: { value: 6.4, confidence: 'high', raw: '6.4' },
          unit: { value: '%', confidence: 'high', raw: '%' },
          refLow: { value: 4.0, confidence: 'high' }, refHigh: { value: 5.6, confidence: 'high' } },
      ],
      warnings: ['mock_provider'],
    }
  },
}

// Pull a JSON object out of a model response that may be wrapped in prose/```json fences.
function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)) } catch { /* fall through */ }
    }
    throw new Error('model did not return valid JSON')
  }
}

/**
 * Real vision provider: Claude on Amazon Bedrock in af-south-1.
 * Use an IN-REGION inference profile id/ARN (BEDROCK_MODEL_ID) so image
 * processing stays entirely within af-south-1 (POPIA — see spec §3.2, §11).
 * Credentials are read from dedicated BEDROCK_* env vars (not the ambient
 * AWS_* names) to avoid collisions with the runtime.
 */
function makeBedrockProvider(): VisionProvider | null {
  const region = Deno.env.get('BEDROCK_REGION') ?? 'af-south-1'
  const accessKeyId = Deno.env.get('BEDROCK_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('BEDROCK_SECRET_ACCESS_KEY')
  const modelId = Deno.env.get('BEDROCK_MODEL_ID') // in-region inference profile
  if (!accessKeyId || !secretAccessKey || !modelId) return null

  const client = new BedrockRuntimeClient({ region, credentials: { accessKeyId, secretAccessKey } })

  return {
    id: `bedrock:${modelId}@${region}`,
    async extract(prompt, imageBase64, mimeType) {
      const requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1500,
        system: prompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Extract now. Respond with ONLY the JSON object described — no prose, no markdown.' },
          ],
        }],
      }
      const res = await client.send(new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      }))
      const decoded = JSON.parse(new TextDecoder().decode(res.body)) as { content?: Array<{ type: string; text?: string }> }
      const text = decoded.content?.find(c => c.type === 'text')?.text ?? ''
      return extractJson(text)
    },
  }
}

function getProvider(): VisionProvider {
  // In-region Bedrock when configured; deterministic mock otherwise so the
  // whole flow still runs in dev without credentials.
  return makeBedrockProvider() ?? mockProvider
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // ── Auth: run as the calling user so RLS applies to scan_captures ──
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  let body: ExtractRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const { artifact, imageBase64, mimeType } = body
  if (!artifact || !imageBase64 || !PROMPTS[artifact]) {
    return json({ error: 'invalid_artifact' }, 400)
  }

  const provider = getProvider()
  let extracted: Record<string, unknown>
  try {
    extracted = await provider.extract(PROMPTS[artifact], imageBase64, mimeType)
  } catch (e) {
    // Record the failure for support/debugging; do NOT store the image.
    await supabase.from('scan_captures').insert({
      profile_id: user.id, artifact, method: 'cloud', engine: provider.id,
      status: 'failed', overall_conf: 0, raw_extract: { error: String(e) },
    })
    return json({ error: 'extraction_failed' }, 502)
  }

  const result = {
    artifact,
    method: 'cloud' as const,
    engine: provider.id,
    warnings: (extracted.warnings as string[]) ?? [],
    ...extracted,
  }

  // Audit row (structured result only — the raw image is discarded here).
  const { data: capture } = await supabase.from('scan_captures').insert({
    profile_id: user.id,
    artifact,
    method: 'cloud',
    engine: provider.id,
    raw_extract: result,
    overall_conf: null,
    status: 'reviewed',
  }).select('id').single()

  return json({ ...result, captureId: capture?.id ?? null })
})
