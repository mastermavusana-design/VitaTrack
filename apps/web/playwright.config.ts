import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

// Load QA_* creds from apps/web/.env.local (gitignored) so `pnpm e2e` works
// without exporting env by hand. Run scripts/qa-seed-accounts.mjs to populate it.
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

/**
 * R1 client-direct QA — Playwright E2E (automated slice of R1_RUNTIME_QA.md).
 *
 * Point it at a running instance that has NEXT_PUBLIC_CLIENT_DIRECT=1 (a flag-on
 * Preview, or local `start-dev.bat` which sets the flag). Auth + Supabase creds
 * come from env — never hard-coded. See docs/qa-automation.md.
 *
 *   QA_BASE_URL   e.g. https://<preview>.vercel.app  (default http://localhost:3002)
 *   QA_EMAIL / QA_PASSWORD   a test account (User A)
 */
const baseURL = process.env.QA_BASE_URL || 'http://localhost:3002'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
})
