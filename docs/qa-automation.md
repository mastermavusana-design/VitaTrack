# R1 QA Automation

Automated slice of `R1_RUNTIME_QA.md`. Two harnesses, both **env-driven** (no secrets in the repo):

1. **Playwright E2E** (`apps/web/e2e/`) — logs in, drives the UI, and asserts every PHI read/write
   goes to the af-south-1 Data API (`*.supabase.co/rest/v1/*`) and **never** to a `/api/*` PHI route.
2. **REST RLS check** (`scripts/rls-check.mjs`) — two real accounts + the anon key, proving RLS
   blocks cross-tenant read/write and that anon can only reach ICE via the RPC.

Together these cover QA Parts 1–3 (routing + reads + writes) and Part 6 (RLS). Offline queue/replay
is already covered by the unit suite (`pnpm --filter @vitatrack/web test`). Still **manual**: the
offline-in-browser toggle + IndexedDB inspection (Part 4/5), camera scan (Part 8), and sign-out
purge visual check (Part 9).

## Prerequisites

- A target running with **`NEXT_PUBLIC_CLIENT_DIRECT=1`** — a flag-on Vercel Preview, or local
  `start-dev.bat` (which sets the flag) serving `http://localhost:3002`.
- Two test accounts on the same Supabase project: **A** (owner) and **B** (unrelated — *not* a
  caregiver of A).
- One-time: `pnpm install` then `pnpm --filter @vitatrack/web exec playwright install chromium`.

## Environment

Put these in an ignored env file (e.g. `apps/web/.env.local`, or export in the shell):

```
# Playwright (User A drives the UI)
QA_BASE_URL=http://localhost:3002          # or the Preview URL
QA_EMAIL=a@example.com
QA_PASSWORD=********

# RLS REST check
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
QA_A_EMAIL=a@example.com
QA_A_PASSWORD=********
QA_B_EMAIL=b@example.com
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
to its `rest/v1/<table>`. Green RLS = B can't read or write A's rows, and anon has no ICE base-table
access but can call the RPC.

## Notes

- The E2E asserts the **negative** (no `/api/*` PHI request) per write, which is the residency
  guarantee — so it also fails loudly if the flag is off (writes would go to `/api/*`). Run it once
  with the flag **off** too: the writes-to-`/api` are expected there, confirming the fallback.
- Selectors match the current button labels ("+ Add reading", "Save medication", "✓ Take", …). If UI
  copy changes, update `e2e/client-direct.spec.ts`.
- `scripts/rls-check.mjs` cleans up the rows it creates. It needs no service role — it uses each
  user's own JWT, exactly like a real client.
- Not in CI by default (needs live creds + a running target). Wire it into a manual/nightly workflow
  with repository secrets if you want it scheduled.
