import { test as setup } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

/** Log in as User A via the password form and persist the session for the suite. */
setup('authenticate as User A', async ({ page }) => {
  const email = process.env.QA_EMAIL
  const password = process.env.QA_PASSWORD
  if (!email || !password) throw new Error('Set QA_EMAIL and QA_PASSWORD in the environment')

  await page.goto('/login')
  await page.locator('input[type=email]').fill(email)
  await page.locator('input[type=password]').fill(password)
  // The login page has a "Sign In" tab toggle (type=button) as well as the form's
  // submit button — scope to the submit inside the form to avoid a strict-mode clash.
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()

  await page.waitForURL('**/dashboard**', { timeout: 30_000 })
  await page.context().storageState({ path: authFile })
})
