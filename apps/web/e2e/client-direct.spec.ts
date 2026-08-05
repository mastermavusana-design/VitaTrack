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

/** Run `action`, assert it produced a POST to rest/v1/<restTable> and none to /api/<apiPath>. */
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
  const restPost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/rest/v1/${restTable}`),
    { timeout: 20_000 },
  )
  await action()
  await restPost
  page.off('request', onReq)
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
