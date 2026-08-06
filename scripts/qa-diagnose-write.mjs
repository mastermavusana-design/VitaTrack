#!/usr/bin/env node
/**
 * One-shot diagnostic: does an authenticated REST insert into `medications`
 * actually persist for the QA-A account? Mirrors the payload the web
 * MedicationForm sends on the client-direct path, prints the real PostgREST
 * status + body, then cleans up. Run from your own shell (needs network).
 *
 *   node scripts/qa-diagnose-write.mjs
 *
 * Reads creds from apps/web/.env.local (populated by qa-seed-accounts.mjs).
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') })

const URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const EMAIL = process.env.QA_A_EMAIL || process.env.QA_EMAIL
const PASSWORD = process.env.QA_A_PASSWORD || process.env.QA_PASSWORD
if (!URL || !ANON || !EMAIL || !PASSWORD) {
  console.error('Missing SUPABASE_URL / ANON / QA_A_EMAIL / QA_A_PASSWORD in apps/web/.env.local')
  process.exit(2)
}

const j = (r) => r.json().catch(() => null)

;(async () => {
  console.log(`Diagnose medications write on ${new global.URL(URL).host} as ${EMAIL}\n`)

  // 1) Sign in (password grant), exactly like the browser session.
  const tokRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const tok = await j(tokRes)
  if (!tokRes.ok || !tok?.access_token) {
    console.error(`Sign-in FAILED: ${tokRes.status} ${JSON.stringify(tok)}`)
    process.exit(1)
  }
  const uid = tok.user?.id
  console.log(`signed in: uid=${uid}`)

  const auth = { apikey: ANON, Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' }

  // 2) Is there a profiles row for this user? (FK target for medications.profile_id)
  const profRes = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}&select=id,popia_consent`, { headers: auth })
  console.log(`profiles row: status ${profRes.status} body ${JSON.stringify(await j(profRes))}`)

  // 3) Insert a medication mirroring MedicationForm's client-direct payload.
  const id = randomUUID()
  const row = {
    id, profile_id: uid, name: `QA DIAG ${Date.now()}`,
    generic_name: null, form: 'tablet', strength: null, strength_unit: 'mg',
    instructions: null, prescriber: null, pill_count: null, refill_threshold: null,
    color: '#EF4444', reminder_enabled: true, is_active: true,
  }
  const insRes = await fetch(`${URL}/rest/v1/medications`, {
    method: 'POST',
    headers: { ...auth, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  const insBody = await j(insRes)
  console.log(`\nINSERT medications: status ${insRes.status}`)
  console.log(`body: ${JSON.stringify(insBody)}`)

  // 4) Read it back the way the app does.
  const readRes = await fetch(`${URL}/rest/v1/medications?profile_id=eq.${uid}&select=id,name,is_active`, { headers: auth })
  const readBody = await j(readRes)
  console.log(`\nREAD back: status ${readRes.status} rows ${Array.isArray(readBody) ? readBody.length : '?'} ${JSON.stringify(readBody)}`)

  // 5) Cleanup.
  await fetch(`${URL}/rest/v1/medications?id=eq.${id}`, { method: 'DELETE', headers: auth })
  console.log('\ncleanup done.')
  console.log(insRes.status === 201 ? '\n=> REST insert PERSISTS. The e2e failure is client-side (browser session/JWT), not RLS.'
                                    : '\n=> REST insert REJECTED. The error body above is the real cause (RLS / constraint).')
})().catch((e) => { console.error(e); process.exit(2) })
