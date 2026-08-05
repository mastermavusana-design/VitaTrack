#!/usr/bin/env node
/**
 * Seed the two QA test accounts (User A + User B) used by the R1 runtime QA
 * harness (Playwright E2E + scripts/rls-check.mjs).
 *
 * Reads the Supabase project + service_role key from apps/web/.env.local, creates
 * (or repairs) two accounts via the GoTrue admin API with email already confirmed
 * — so no confirmation email is sent and password login works immediately — then
 * writes the QA_* + SUPABASE_* variables back into apps/web/.env.local so the
 * harness (which now auto-loads that file) can pick them up.
 *
 * Idempotent: re-running resets each account's password to a fresh value and
 * leaves .env.local consistent. Safe to run as often as you like.
 *
 *   node scripts/qa-seed-accounts.mjs
 *
 * Notes:
 *  - User B is an INDEPENDENT account (never a caregiver of A), which is exactly
 *    what the cross-tenant RLS check needs.
 *  - The service_role key never leaves your machine; this script only talks to
 *    your own Supabase project. Run it from your own shell (the sandbox has no
 *    network route to supabase.co).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '../apps/web/.env.local')

// Plus-addressed on the project owner's inbox: valid + deliverable, but with
// email_confirm we never actually send mail. Override via QA_A_EMAIL/QA_B_EMAIL.
const A_EMAIL = process.env.QA_A_EMAIL || 'mastermavusana+vt-qa-a@gmail.com'
const B_EMAIL = process.env.QA_B_EMAIL || 'mastermavusana+vt-qa-b@gmail.com'

function parseEnv(text) {
  const map = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return map
}

function strongPassword() {
  // 24 url-safe chars + guaranteed classes, comfortably above any policy.
  return 'Qa1!' + randomBytes(18).toString('base64url')
}

async function findUserByEmail(base, headers, email) {
  // GoTrue admin list is paginated; scan until found or exhausted.
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers })
    if (!res.ok) throw new Error(`list users failed (${res.status}): ${await res.text()}`)
    const body = await res.json()
    const users = body.users || body || []
    const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (users.length < 200) break
  }
  return null
}

async function ensureUser(base, headers, email) {
  const password = strongPassword()
  // Try to create with email pre-confirmed.
  const createRes = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })

  if (createRes.ok) {
    const u = await createRes.json()
    return { email, password, id: u.id, created: true }
  }

  const errText = await createRes.text()
  const alreadyExists =
    createRes.status === 422 || /exist|registered|already/i.test(errText)
  if (!alreadyExists) {
    throw new Error(`create ${email} failed (${createRes.status}): ${errText}`)
  }

  // Already there — look it up and reset the password so we know it.
  const existing = await findUserByEmail(base, headers, email)
  if (!existing) {
    throw new Error(`${email} reported as existing but not found in admin list`)
  }
  const updRes = await fetch(`${base}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  })
  if (!updRes.ok) {
    throw new Error(`reset password for ${email} failed (${updRes.status}): ${await updRes.text()}`)
  }
  return { email, password, id: existing.id, created: false }
}

/** Upsert a managed block of KEY=VALUE lines into .env.local, preserving the rest. */
function writeEnv(envPath, original, updates) {
  const managed = new Set(Object.keys(updates))
  const kept = original
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.includes('=')) return true
      const key = line.slice(0, line.indexOf('=')).trim()
      return !managed.has(key)
    })
  // Drop a previous managed marker block if present.
  const marker = '# ── QA harness (managed by scripts/qa-seed-accounts.mjs) ──'
  const beforeMarker = []
  for (const line of kept) {
    if (line.trim() === marker.trim()) break
    beforeMarker.push(line)
  }
  while (beforeMarker.length && beforeMarker[beforeMarker.length - 1].trim() === '') {
    beforeMarker.pop()
  }
  const block = [marker, ...Object.entries(updates).map(([k, v]) => `${k}=${v}`)]
  writeFileSync(envPath, [...beforeMarker, '', ...block, ''].join('\n'))
}

async function main() {
  let original
  try {
    original = readFileSync(ENV_PATH, 'utf8')
  } catch {
    console.error(`Cannot read ${ENV_PATH} — run from the repo root with apps/web/.env.local present.`)
    process.exit(2)
  }
  const env = parseEnv(original)
  const base = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !anon) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local')
    process.exit(2)
  }
  if (!service || service.length < 40) {
    console.error('Missing/placeholder SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local (Settings → API → service_role).')
    process.exit(2)
  }

  const headers = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    'Content-Type': 'application/json',
  }

  console.log(`Seeding QA accounts on ${new URL(base).host} …`)
  const a = await ensureUser(base, headers, A_EMAIL)
  console.log(`  User A  ${a.email}  (${a.created ? 'created' : 'password reset'})`)
  const b = await ensureUser(base, headers, B_EMAIL)
  console.log(`  User B  ${b.email}  (${b.created ? 'created' : 'password reset'})`)

  writeEnv(ENV_PATH, original, {
    // Playwright (drives the UI as User A)
    QA_BASE_URL: env.QA_BASE_URL || 'http://localhost:3002',
    QA_EMAIL: a.email,
    QA_PASSWORD: a.password,
    // RLS REST check
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: anon,
    QA_A_EMAIL: a.email,
    QA_A_PASSWORD: a.password,
    QA_B_EMAIL: b.email,
    QA_B_PASSWORD: b.password,
  })

  console.log(`\nWrote QA_* + SUPABASE_* into apps/web/.env.local (gitignored).`)
  console.log('Next:')
  console.log('  pnpm --filter @vitatrack/web e2e     # routing / reads / writes')
  console.log('  node scripts/rls-check.mjs           # cross-tenant RLS + anon ICE')
}

main().catch((e) => {
  console.error('\nSeed failed:', e.message)
  process.exit(1)
})
