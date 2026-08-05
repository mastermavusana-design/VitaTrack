#!/usr/bin/env node
/**
 * R1 RLS cross-tenant check (automated slice of R1_RUNTIME_QA.md Part 6).
 *
 * Talks straight to the Supabase REST + Auth API with TWO real accounts and the
 * anon key — proving RLS blocks cross-tenant access even from a hostile client.
 * Node 20+ (global fetch). All secrets via env; nothing is hard-coded.
 *
 *   SUPABASE_URL          https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY     the public anon key
 *   QA_A_EMAIL/PASSWORD   User A (owner)
 *   QA_B_EMAIL/PASSWORD   User B (unrelated — NOT a caregiver of A)
 *
 * Run:  node scripts/rls-check.mjs
 */

const URL = requireEnv('SUPABASE_URL').replace(/\/$/, '')
const ANON = requireEnv('SUPABASE_ANON_KEY')
const A = { email: requireEnv('QA_A_EMAIL'), password: requireEnv('QA_A_PASSWORD') }
const B = { email: requireEnv('QA_B_EMAIL'), password: requireEnv('QA_B_PASSWORD') }

function requireEnv(k) {
  const v = process.env[k]
  if (!v) { console.error(`Missing env: ${k}`); process.exit(2) }
  return v
}

let pass = 0, fail = 0
function check(ok, name, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`FAIL   ${name}${detail ? '  :: ' + detail : ''}`) }
}

async function signIn({ email, password }) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) { console.error(`Sign-in failed for ${email}: ${r.status} ${JSON.stringify(j)}`); process.exit(2) }
  return { token: j.access_token, id: j.user?.id }
}

const rest = (token) => (path, init = {}) =>
  fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })

;(async () => {
  console.log(`RLS check against ${URL}\n`)
  const a = await signIn(A)
  const b = await signIn(B)
  check(!!a.id && !!b.id && a.id !== b.id, 'signed in two distinct users')

  const asA = rest(a.token)
  const asB = rest(b.token)

  // Seed: A inserts a vital that B must never see.
  const seedRes = await asA('vitals', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ profile_id: a.id, type: 'weight', weight_value: 1, recorded_at: new Date().toISOString() }),
  })
  const seed = (await seedRes.json().catch(() => []))[0]
  check(seedRes.status === 201 && !!seed?.id, 'A can insert own vital (seed)', `status ${seedRes.status}`)

  // 1. B cannot READ A's rows (RLS filters silently → empty).
  const readRes = await asB(`vitals?profile_id=eq.${a.id}&select=id`)
  const readRows = await readRes.json().catch(() => null)
  check(readRes.status === 200 && Array.isArray(readRows) && readRows.length === 0,
    'B cannot read A\'s vitals (cross-tenant SELECT denied)', `status ${readRes.status} rows ${JSON.stringify(readRows)}`)

  // 2. B cannot WRITE into A's profile (RLS WITH CHECK → 401/403).
  const writeRes = await asB('vitals', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ profile_id: a.id, type: 'weight', weight_value: 99, recorded_at: new Date().toISOString() }),
  })
  check(writeRes.status === 401 || writeRes.status === 403,
    'B cannot write a vital into A\'s profile (RLS WITH CHECK)', `status ${writeRes.status}`)

  // 3. Sanity: B CAN write its own row (then clean up).
  const ownRes = await asB('vitals', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ profile_id: b.id, type: 'weight', weight_value: 2, recorded_at: new Date().toISOString() }),
  })
  const ownRow = (await ownRes.json().catch(() => []))[0]
  check(ownRes.status === 201, 'B can write its own vital (sanity)', `status ${ownRes.status}`)
  if (ownRow?.id) await asB(`vitals?id=eq.${ownRow.id}`, { method: 'DELETE' })

  // 4. Anon has NO base-table SELECT on ice_profiles.
  const anonIce = await fetch(`${URL}/rest/v1/ice_profiles?select=id&limit=1`, { headers: { apikey: ANON } })
  check(anonIce.status === 401 || anonIce.status === 403,
    'anon cannot SELECT ice_profiles base table', `status ${anonIce.status}`)

  // 5. Anon CAN call the public ICE RPC (returns nothing for an unknown token).
  const anonRpc = await fetch(`${URL}/rest/v1/rpc/get_public_ice_profile`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: 'no-such-token' }),
  })
  const rpcRows = await anonRpc.json().catch(() => null)
  check(anonRpc.status === 200 && Array.isArray(rpcRows) && rpcRows.length === 0,
    'anon can call get_public_ice_profile RPC (empty for unknown token)', `status ${anonRpc.status}`)

  // Cleanup seed.
  if (seed?.id) await asA(`vitals?id=eq.${seed.id}`, { method: 'DELETE' })

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
