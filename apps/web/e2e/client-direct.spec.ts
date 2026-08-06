import { test, expect, type Page } from '@playwright/test'

/**
 * R1 client-direct QA — automated slice of R1_RUNTIME_QA.md (Parts 1–3 + writes).
 * Requires the target to have NEXT_PUBLIC_CLIENT_DIRECT=1.
 *
 * Core invariant: every PHI read/write goes to the af-south-1 Data API
 * (`*.supabase.co/rest/v1/*`) and NEVER to a Vercel `/api/*` PHI route.
 */

const DATA_API = /\.supabase\.co\/rest\/v1\//
const PHI_API = /\/api\/(vitals|medications|dose-logs|doctor-visits|documents|ice|profile|scan-captures|push)\b/

const DASHBOARD_PAGES = [
  '/dashboard',
  '/dashboard/vitals',
  '/dashboard/medications',
  '/dashboard/records',
  '/dashboard/ice',
  '/dashboard/notifications',
  '/dashboard/settings',
  '/dashboard/caregivers',
]

/**
 * Run `action`, then assert it produced a POST to rest/v1/<restTable> that the
 * server actually ACCEPTED (2xx) — not just that a request was sent — and that
 * nothing touched /api/<apiPath>. Asserting the response status is what proves
 * residency AND persistence; a routed-but-rejected write (e.g. 401/403) would
 * otherwise pass silently.
 */
async function expectClientDirectWrite(
  page: Page,
  restTable: string,
  apiPath: string,
  action: () => Promise<void>,
) {
  const apiHits: string[] = []
  const onReq = (r: import('@playwright/test').Request) => {
    if (r.url().includes(`/api/${apiPath}`)) apiHits.push(`${r.method()} ${r.url()}`)
  }
  page.on('request', onReq)
  const restResp = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes(`/rest/v1/${restTable}`),
    { timeout: 20_000 },
  )
  await action()
  const resp = await restResp
  page.off('request', onReq)

  const status = resp.status()
  if (status < 200 || status >= 300) {
    const body = await resp.text().catch(() => '(no body)')
    throw new Error(`rest/v1/${restTable} write was rejected: HTTP ${status} — ${body}`)
  }
  expect(apiHits, `${restTable} write must not touch /api/${apiPath}`).toEqual([])
}

test('Part 1+3 — every dashboard page reads from rest/v1, never /api/*', async ({ page }) => {
  const reqs: string[] = []
  page.on('request', (r) => reqs.push(r.url()))

  for (const p of DASHBOARD_PAGES) {
    await page.goto(p)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toBeVisible()
  }

  const dataApi = reqs.filter((u) => DATA_API.test(u))
  const phiApi = reqs.filter((u) => PHI_API.test(u))
  expect(dataApi.length, 'expected client-direct reads to the Data API').toBeGreaterThan(0)
  expect(phiApi, 'no PHI read should route through /api/*').toEqual([])
})

test('Part 2.1 — add a vital → rest/v1/vitals (not /api/vitals)', async ({ page }) => {
  await page.goto('/dashboard/vitals')
  await expectClientDirectWrite(page, 'vitals', 'vitals', async () => {
    await page.getByRole('button', { name: '+ Add reading' }).click()
    // Blood pressure is the default type: fill the first two numeric fields.
    const nums = page.locator('input[inputmode="numeric"]')
    await nums.nth(0).fill('121')
    await nums.nth(1).fill('79')
    await page.getByRole('button', { name: 'Save reading' }).click()
  })
})

test('Part 2.2 — add a medication → rest/v1/medications', async ({ page }) => {
  await page.goto('/dashboard/medications')
  const name = `QA E2E Med ${Date.now()}`
  await expectClientDirectWrite(page, 'medications', 'medications', async () => {
    await page.getByRole('button', { name: '+ Add medication' }).click()
    await page.getByPlaceholder('e.g. Amlodipine').fill(name)
    await page.getByRole('button', { name: 'Save medication' }).click()
  })
})

test('Part 2.3 — Take a dose → rest/v1/dose_logs (not /api/dose-logs)', async ({ page }) => {
  await page.goto('/dashboard/medications')
  await expect(page.getByRole('button', { name: '✓ Take' }).first()).toBeVisible()
  await expectClientDirectWrite(page, 'dose_logs', 'dose-logs', async () => {
    await page.getByRole('button', { name: '✓ Take' }).first().click()
  })
})

test('Part 2.7 — add a visit → rest/v1/doctor_visits (not /api/doctor-visits)', async ({ page }) => {
  await page.goto('/dashboard/records')
  await expectClientDirectWrite(page, 'doctor_visits', 'doctor-visits', async () => {
    await page.getByRole('button', { name: '+ Add visit' }).click()
    // visit_date is prefilled to today; provider is optional.
    await page.getByRole('button', { name: 'Save visit' }).click()
  })
})

test('Part 2.9 — save ICE → rest/v1/ice_profiles (not /api/ice)', async ({ page }) => {
  await page.goto('/dashboard/ice')
  await expect(page.getByRole('button', { name: 'Save emergency profile' })).toBeVisible()
  await expectClientDirectWrite(page, 'ice_profiles', 'ice', async () => {
    await page.getByRole('button', { name: 'Save emergency profile' }).click()
  })
})

/* ─── Offline + sign-out (Parts 4, 5, 9) ─────────────────────────────────────
 * These drive the REAL browser IndexedDB (`vitatrack-clientq`) and the SW read
 * cache — the pieces the unit suite (which uses an in-memory IDB + Supabase stub)
 * can't touch. Playwright's context.setOffline() flips the same `navigator.onLine`
 * flag the data layer keys on (dataStore.isOffline), so the queue/replay and
 * read-cache paths run exactly as in production.
 */

/** Count queued writes for `table` in the real `vitatrack-clientq` → `writes` store. */
function countWrites(page: Page, table: string): Promise<number> {
  return page.evaluate(
    (t) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('vitatrack-clientq')
        open.onerror = () => resolve(-1)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('writes')) return resolve(0)
          const rq = db.transaction('writes', 'readonly').objectStore('writes').getAll()
          rq.onsuccess = () => resolve((rq.result || []).filter((w: { table?: string }) => w.table === t).length)
          rq.onerror = () => resolve(-1)
        }
      }),
    table,
  )
}

/** Count entries in the real `vitatrack-clientq` → `reads` cache store. */
function readCacheCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('vitatrack-clientq')
        open.onerror = () => resolve(-1)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('reads')) return resolve(0)
          const rq = db.transaction('reads', 'readonly').objectStore('reads').getAll()
          rq.onsuccess = () => resolve((rq.result || []).length)
          rq.onerror = () => resolve(-1)
        }
      }),
  )
}

/** Whether an IndexedDB database named `name` currently exists. */
function dbExists(page: Page, name: string): Promise<boolean> {
  return page.evaluate(async (n) => {
    // If the browser can't enumerate DBs, don't fail the test on a false negative.
    if (!indexedDB.databases) return true
    const dbs = await indexedDB.databases()
    return dbs.some((d) => d.name === n)
  }, name)
}

/**
 * Cached PHI-bearing entries across the app's `vt-*` caches — dashboard documents
 * or `/api/*` responses. The SW legitimately re-creates static/landing caches when
 * the public `/` page loads after sign-out, so "zero vt- caches" is the wrong bar;
 * "no cached PHI survives" is the security property.
 */
function phiCacheEntries(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (!('caches' in window)) return []
    const names = (await caches.keys()).filter((k) => k.startsWith('vt-'))
    const hits: string[] = []
    for (const n of names) {
      const c = await caches.open(n)
      for (const req of await c.keys()) {
        const p = new URL(req.url).pathname
        if (p.startsWith('/dashboard') || p.startsWith('/api/')) hits.push(p)
      }
    }
    return hits
  })
}

test('Part 4 — offline write queues, replays once on reconnect, no duplicate', async ({ page, context }) => {
  // Track every POST that reaches the Data API's vitals table.
  const vitalPosts: number[] = []
  page.on('response', (r) => {
    if (r.request().method() === 'POST' && /\/rest\/v1\/vitals\b/.test(r.url())) vitalPosts.push(r.status())
  })

  await page.goto('/dashboard/vitals')
  await page.waitForLoadState('networkidle')

  // Offline: the write should enqueue optimistically, not hit the network.
  await context.setOffline(true)
  await page.getByRole('button', { name: '+ Add reading' }).click()
  const nums = page.locator('input[inputmode="numeric"]')
  await nums.nth(0).fill('118')
  await nums.nth(1).fill('76')
  await page.getByRole('button', { name: 'Save reading' }).click()

  await expect.poll(() => countWrites(page, 'vitals'), { timeout: 10_000 }).toBe(1)
  expect(vitalPosts, 'no POST should reach rest/v1/vitals while offline').toEqual([])

  // Reconnect: the `online` handler drains the queue exactly once.
  await context.setOffline(false)
  await page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/rest\/v1\/vitals\b/.test(r.url()),
    { timeout: 20_000 },
  )
  await expect.poll(() => countWrites(page, 'vitals'), { timeout: 10_000 }).toBe(0)
  expect(
    vitalPosts.filter((s) => s >= 200 && s < 300).length,
    'the queued write should replay exactly once',
  ).toBe(1)

  // No duplicate replay: reloading (which re-runs replayQueue on load) must not
  // re-POST — the queue is empty and the client-uuid/23505 guard holds.
  const postsAfterDrain = vitalPosts.length
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.reload()
  await page.waitForLoadState('networkidle')
  expect(vitalPosts.length, 'no duplicate replay across two reloads').toBe(postsAfterDrain)
  await expect.poll(() => countWrites(page, 'vitals')).toBe(0)
})

test('Part 5 — an online visit populates the offline read cache', async ({ page }) => {
  // SCOPE: this asserts the *data* half of offline reads — that visiting a page
  // online fills the IndexedDB read cache, so the rows are available offline.
  // That cache being *served* when offline is unit-tested (dataStore.test.ts →
  // cachedSelect returns fromCache when navigator is offline).
  //
  // The *rendered* offline page + amber banner stays a MANUAL step (R1_RUNTIME_QA
  // Part 5). Reason: all dashboard nav is a full-document <a> load, so reaching a
  // dashboard page offline depends entirely on the service worker serving the
  // cached document on reload — which we can't reliably drive headlessly in a
  // fresh context. See docs/qa-automation.md for the manual check.
  await page.goto('/dashboard/medications')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('h1')).toBeVisible()

  // MedicationsClient's cachedSelect runs on mount and writes to the `reads` store.
  await expect.poll(() => readCacheCount(page), { timeout: 10_000 }).toBeGreaterThan(0)
})

test('Part 9 — sign-out drops the vitatrack-clientq DB and vt-* caches', async ({ page }) => {
  // Visit a client-direct page so the read cache (and hence the DB) exists.
  await page.goto('/dashboard/medications')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('h1')).toBeVisible()
  await expect.poll(() => dbExists(page, 'vitatrack-clientq'), { timeout: 10_000 }).toBe(true)

  // Sign out via the nav (one of the three purge paths; all call clearOfflineData).
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/dashboard'), { timeout: 30_000 })

  // The client DB (PHI store) is deleted, and no cached PHI response survives.
  // (The SW may re-create static/landing caches for the public '/' page — that's
  // fine; what matters is that no dashboard/api PHI entry lingers.)
  await expect.poll(() => dbExists(page, 'vitatrack-clientq'), { timeout: 15_000 }).toBe(false)
  await expect.poll(() => phiCacheEntries(page), { timeout: 15_000 }).toEqual([])
})
