# R1 QA Automation

Automated slice of `R1_RUNTIME_QA.md`. Two harnesses, both **env-driven** (no secrets in the repo):

1. **Playwright E2E** (`apps/web/e2e/`) — logs in, drives the UI, and asserts every PHI read/write
   goes to the af-south-1 Data API (`*.supabase.co/rest/v1/*`) and **never** to a `/api/*` PHI route.
   Each write also asserts the Data API **accepted** it (HTTP 2xx) — so a routed-but-rejected write
   (e.g. 401 under RLS) fails loudly instead of passing on routing alone.
2. **REST RLS check** (`scripts/rls-check.mjs`) — two real accounts + the anon key, proving RLS
   blocks cross-tenant read/write and that anon can only reach ICE via the RPC.

Together these cover QA Parts 1–3 (routing + reads + writes), Part 6 (RLS), and — via real-browser
IndexedDB + `context.setOffline()` in the same E2E spec — Part 4 (offline queue→replay with a
no-duplicate check), the *data half* of Part 5 (an online visit populates the offline read cache),
and Part 9 (sign-out deletes the `vitatrack-clientq` DB and leaves no cached PHI). Offline
queue/replay *logic* is additionally covered by the unit suite (`pnpm --filter @vitatrack/web test`)
against an in-memory IDB + Supabase stub; the E2E versions exercise the real browser DB and caches
the unit suite can't.

Still **manual**:
- **Part 5 rendered offline page + banner.** All dashboard navigation is a full-document `<a>` load,
  so reaching a dashboard page offline depends entirely on the service worker serving the cached
  document on reload — which we can't reliably drive in a fresh headless context. Manual check
  (warm browser): visit `/dashboard/medications`, then DevTools → Network → **Offline**, and reload.
  Expect the page to render from cache with the amber "Showing saved data — you appear to be offline."
  banner. If it instead shows the "You're offline" page, offline read access is broken (a real bug,
  not a test artifact) — the SW nav fallback (`ignoreVary`) and the `waitUntil`-guarded cache write
  are the two fixes already in `public/sw.js`; re-verify after deploying them.
- **Camera scan (Part 8).** The QR branch is automatable but needs a seeded test issuer keypair +
  fake-video device; the OCR branch is too flaky to gate CI.

## Prerequisites

- A target running with **`NEXT_PUBLIC_CLIENT_DIRECT=1`** — a flag-on Vercel Preview, or local
  `start-dev.bat` (which sets the flag) serving `http://localhost:3002`.
- Two test accounts on the same Supabase project: **A** (owner) and **B** (unrelated — *not* a
  caregiver of A). Create them in one step with the seed script below.
- One-time: `pnpm install` then `pnpm --filter @vitatrack/web exec playwright install chromium`.

## Seed the test accounts (one command)

`scripts/qa-seed-accounts.mjs` creates (or repairs) User A + User B on the hosted Supabase project
via the GoTrue **admin** API with email pre-confirmed — no confirmation mail is sent and password
login works immediately — then writes the `QA_*` + `SUPABASE_*` variables into `apps/web/.env.local`
(gitignored) so both harnesses pick them up automatically.

```bash
node scripts/qa-seed-accounts.mjs
```

- Reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `apps/web/.env.local`; the
  service-role key never leaves your machine.
- Idempotent — re-running resets each account's password to a fresh value and rewrites the env block.
- Default emails are plus-addressed on the project owner's inbox (`…+vt-qa-a@gmail.com`,
  `…+vt-qa-b@gmail.com`); override with `QA_A_EMAIL` / `QA_B_EMAIL`.
- **Run it from your own shell**, not the sandbox — the sandbox has no network route to supabase.co.

## Environment

The seed script populates these in `apps/web/.env.local`. Both harnesses **auto-load that file**
(via `dotenv`), so no manual `export` is needed. To run against a different target, edit the file or
override individual vars in the shell:

```
# Playwright (User A drives the UI)
QA_BASE_URL=http://localhost:3002          # or the Preview URL
QA_EMAIL=…+vt-qa-a@gmail.com
QA_PASSWORD=********

# RLS REST check
SUPABASE_URL=https://<ref>.supabase.co     # falls back to NEXT_PUBLIC_SUPABASE_URL if unset
SUPABASE_ANON_KEY=<anon key>               # falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY if unset
QA_A_EMAIL=…+vt-qa-a@gmail.com
QA_A_PASSWORD=********
QA_B_EMAIL=…+vt-qa-b@gmail.com
QA_B_PASSWORD=********
```

## Run

```bash
# E2E — routing, reads, and writes (vital, medication, dose, visit, ICE)
pnpm --filter @vitatrack/web e2e
# ...or watch it: pnpm --filter @vitatrack/web e2e:headed

# RLS cross-tenant + anon ICE
node scripts/rls-check.mjs
```

Green E2E = every dashboard page reads from `rest/v1` (zero `/api/*` PHI calls) and each write POSTs
to its `rest/v1/<table>` **and is accepted (2xx)**. Green RLS = B can't read or write A's rows, and
anon has no ICE base-table access but can call the RPC.

## Diagnosing a failing write

When a write test fails, the first question is always: is it the backend (RLS/constraint) or the
browser client (session/JWT not attached)? `scripts/qa-diagnose-write.mjs` answers it — it signs in
as User A, checks the `profiles` row exists, attempts a `medications` insert mirroring the web form's
payload, prints the real PostgREST status + body, reads it back, and cleans up.

```bash
node scripts/qa-diagnose-write.mjs
```

- **201 + reads back** → REST/RLS are fine; the failure is client-side (browser session).
- **4xx** → the printed body is the real cause (RLS `WITH CHECK`, a constraint, or a missing profile).

Run it from your own shell (needs network).

## CI (manual)

`.github/workflows/qa-runtime.yml` runs both harnesses on a hosted runner via **`workflow_dispatch`**
(Actions tab → "QA — R1 runtime (manual)" → pick branch → optionally override the URL → Run). It is
**not** on push/PR — it needs live creds + a running flag-on target.

- Requires these **repository secrets** (Settings → Secrets and variables → Actions): `QA_BASE_URL`
  (a flag-on Preview URL), `QA_EMAIL`, `QA_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `QA_A_EMAIL`, `QA_A_PASSWORD`, `QA_B_EMAIL`, `QA_B_PASSWORD` — copy the values the seed script wrote
  into `apps/web/.env.local`.
- The E2E needs a **deployed** flag-on target (a Vercel Preview); a runner has no local dev server.
- GitHub only shows the **Run workflow** button once the workflow file is on the **default branch**
  (`main`) — so it's dormant until promoted there via the usual `develop` → `main` PR.
- On failure it uploads the Playwright traces/screenshots as an artifact.

## Notes

- The E2E asserts the **negative** (no `/api/*` PHI request) per write, which is the residency
  guarantee — so it also fails loudly if the flag is off (writes would go to `/api/*`). Run it once
  with the flag **off** too: the writes-to-`/api` are expected there, confirming the fallback.
- Selectors match the current button labels ("+ Add reading", "Save medication", "✓ Take", …). If UI
  copy changes, update `e2e/client-direct.spec.ts`. The login page has two "Sign In" buttons (the
  Sign In / Sign Up tab toggle and the form submit), so `auth.setup.ts` scopes the click to the
  form's submit button.
- `scripts/rls-check.mjs` cleans up the rows it creates. It needs no service role — it uses each
  user's own JWT, exactly like a real client. `scripts/qa-diagnose-write.mjs` also cleans up.
- Not in CI by default (needs live creds + a running target). The manual `qa-runtime.yml` workflow
  wires it to repository secrets; add a `schedule:` block there if you later want it nightly.
