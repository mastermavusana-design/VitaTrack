# VitaTrack — Remediation Plan

_Prepared 1 August 2026. Companion to `IMPLEMENTATION_PLAN.md`._

This document is a prioritized, actionable list of defects and risks found in a full-repo
review (web, mobile, shared, Supabase). Each item has a **severity**, a concrete **fix**,
and an **effort** estimate. Work top-to-bottom: the top three items are compliance/security
and share a single architectural fix, so they collapse together.

---

## How to read this

**Severity**

| Level | Meaning |
|---|---|
| 🔴 Critical | Breaks the core product claim (POPIA data residency) or exposes PHI. Fix before launch. |
| 🟠 High | Security weakness, deprecated dependency, or a data-loss bug. Fix this sprint. |
| 🟡 Medium | Correctness/hygiene issue with a real but bounded blast radius. Fix before scale. |
| ⚪ Low | Consistency/quality. Fix when convenient. |

**Effort**

| Size | Rough cost |
|---|---|
| S | < half a day |
| M | 1–2 days |
| L | 3+ days / architectural |

---

## Summary table

| # | Issue | Severity | Effort |
|---|---|---|---|
| R1 | Web backend runs in London (`lhr1`) while app claims `af-south-1` / POPIA residency | 🔴 Critical | L |
| R2 | Server auth uses `getSession()` (unverified) instead of `getUser()` | 🟠 High | M |
| R3 | Deprecated `@supabase/auth-helpers-nextjs` — migrate to `@supabase/ssr` | 🟠 High | M |
| R4 | Two overlapping reminder systems (Vercel cron **and** Supabase Edge crons) | 🟠 High | M |
| R5 | Sync bug: vitals pull on `created_at`; no conflict resolution | 🟠 High (filter ✅ / structural ⏳) | M–L |
| R6 | Cloud OCR/Bedrock fallback reintroduces the residency problem | ✅ Done | S–M |
| R7 | Repo hygiene — stale `_tmp_*` files (no git leak; see revised note) | ⚪ Low | S |
| R8 | Everything commits straight to `main` = production; no staging gate | 🟡 Medium | S |
| R9 | Test coverage limited to shared utils — no RLS or API-route tests | 🟡 Medium | M–L |
| R10 | Vercel cron cadence (every 5 min) — cost + up-to-5-min reminder lag | ⚪ Low | S |
| R11 | Third-party processors (Resend, Sentry) not residency-reviewed | ⚪ Low | S |
| R12 | Web app not at feature parity with mobile (product goal) | 🟠 High | L |

> **Fast path:** R1, R2, R4 and R10 are all resolved by one move — pushing all
> PHI-touching server logic and crons into Supabase Edge Functions in `af-south-1`
> and shrinking the Vercel tier to frontend delivery. Do that first.

---

## R1 — Web backend processes SA health data outside `af-south-1` 🔴 Critical · L

**What.** `apps/web/vercel.json` pins functions to `"regions": ["lhr1"]` (London). The
README sells VitaTrack as "POPIA-compliant… hosted in the `af-south-1` region." Vercel
has no African region, so every Next.js API route (`/api/medications`, `/api/vitals`,
`/api/ice`, `/api/dose-logs`, …) and the reminder cron execute in the EU, handling South
African medical PII.

**Why it matters.** POPIA restricts cross-border transfer of personal information. The
product's headline compliance claim is contradicted by the deployment. This is a legal/
trust exposure, not just a config nit.

**Fix.**
1. Make Supabase (already `af-south-1`) the only tier that touches PHI.
2. Move server-side data logic out of Next.js API routes into Supabase Edge Functions
   (which run in your project's region) or call Supabase directly from the client under RLS
   (already done for reads).
3. Reduce `apps/web` to frontend delivery + auth callback only. Vercel then serves static/
   rendered pages; no PHI is processed there.
4. If any Next.js route must stay server-side, host it somewhere with an African/adequate
   region and document the data flow. Update the README to match reality either way.

**Acceptance.** No route that reads/writes `medications`, `vitals`, `documents`, `ice_profiles`,
`dose_logs`, or `profiles` executes outside `af-south-1`.

---

## R2 — Server authorization trusts unverified sessions 🟠 High · M

**What.** 30 server-side `getSession()` calls vs 3 `getUser()`. On the server,
`getSession()` returns the session from the cookie **without** revalidating the JWT against
the auth server; API routes then authorize on `session.user.id`.

**Why it matters.** Supabase explicitly documents that server code and middleware must use
`getUser()` for authorization because it verifies the token. RLS is currently your backstop
(good — 23 policies exist), but authorization decisions should not ride on unverified claims.

**Fix.** Replace `getSession()` with `getUser()` in every server context (route handlers +
`middleware.ts`). Use `getSession()` only where you need non-authoritative session presence.
Pairs naturally with R3 (the `@supabase/ssr` migration touches the same call sites).

**Acceptance.** No route handler or middleware makes an authorization decision from
`getSession()`.

---

## R3 — Deprecated Supabase auth library 🟠 High · M

**What.** `apps/web` depends on `@supabase/auth-helpers-nextjs@^0.9.0`, which Supabase has
deprecated in favour of `@supabase/ssr`.

**Why it matters.** Deprecated packages stop receiving security and Next.js-compatibility
fixes; it will block a future Next.js upgrade.

**Fix.** Migrate to `@supabase/ssr`: replace `createMiddlewareClient` /
`createServerComponentClient` with the `createServerClient` / `createBrowserClient` cookie
pattern in `src/lib/supabase.ts` and `middleware.ts`. Fold the R2 `getUser()` change into the
same PR.

**Acceptance.** `@supabase/auth-helpers-nextjs` removed from `package.json`; auth flows
(login, refresh, protected routes, ICE public page) verified.

---

## R4 — Two overlapping reminder systems 🟠 High · M

**What.** Reminders exist in two places: the Vercel cron `/api/cron/reminders` (web push,
every 5 min) **and** Supabase Edge crons `dose-materialize` (15 min), `caregiver-alert`
(10 min), `refill-daily` (daily). Refill logic is implemented in both.

**Why it matters.** Duplicated business logic, double the failure surface, and possible
double-notification. It also keeps a PHI-touching cron on Vercel (feeds R1).

**Fix.** Consolidate all scheduling into Supabase Edge Functions + `pg_cron` in `af-south-1`.
Keep web-push subscriptions in Supabase (already stored in `push_tokens`) and send them from
an Edge Function. Delete `/api/cron/reminders` and its `crons` entry in `vercel.json`.

**Acceptance.** One reminder/refill code path; Vercel has no cron.

---

## R5 — Offline sync bug + no conflict resolution 🟠 High · M–L

**What.** In `apps/mobile/db/sync.ts`, `pullVitals` filters on `created_at` while
`pullMedications` filters on `updated_at`. Edited vitals (whose `created_at` is unchanged)
never re-pull. Push is last-write-wins with no conflict handling, and only vitals/meds/
dose_logs sync.

**Why it matters.** Silent data loss / stale records — unacceptable for a health record.

**Fix.**
1. ✅ **Done (2026-08-01).** `vitals` had **no** `updated_at` column (only `created_at`) and
   is append-only in the app today, so the edit bug was latent but the model was inconsistent.
   Added migration `20240801000000_vitals_updated_at.sql` (column + backfill + shared
   `set_updated_at()` trigger + index) and switched the sync filter in
   `apps/mobile/db/sync.ts` to `gt('updated_at', since)`. **Deploy ordering:** apply the
   migration before shipping the mobile build.
2. ⏳ **Still open (structural).** Replace the hand-rolled pull-then-push with WatermelonDB's
   built-in `synchronize()` (last-pulled-at + conflict callbacks), and add soft-delete
   propagation so deletions sync. Scheduled for Phase 2.

**Acceptance.** Editing a vital on one device reflects on another after sync; deletions
propagate; a conflict test passes.

---

## R6 — Cloud OCR/AI fallback breaks residency ✅ Done (2026-08-01)

**Decision:** on-device only (SALVATOR_ORBIS). PHI never leaves the device.

**Done in code:**
- `apps/mobile/hooks/useCapture.ts` — removed the `extractCloud` path and the
  `supabase.functions.invoke('extract-reading')` call; all photos (device screens *and*
  documents/lab reports/prescriptions) now run through on-device ML Kit OCR.
- `supabase/functions/extract-reading/index.ts` — replaced with a 410 tombstone so any
  still-deployed instance fails closed.
- `.env.example` — removed the `BEDROCK_*` vars.

**Left for the user (deploy):** `supabase functions delete extract-reading` and delete the
folder; remove any `BEDROCK_*` values from the Supabase function config.

**Acceptance.** ✅ No client invokes a cloud extractor; no PHI leaves the device.

---

## R7 — Repo hygiene ⚪ Low · S — _mostly resolved_

**What (revised after inspection).** No leak in git: `git ls-files` confirms neither
`supabase/.temp/` nor the `_tmp_8_*` files are tracked — `.temp/` was already gitignored, so
the project-ref never entered version control. Downgraded from Medium to Low.

**Remaining.** Two empty `_tmp_8_*` files sit physically in the working tree (the mount blocks
the sandbox from deleting them). `_tmp_*` has been added to `.gitignore`.

**Fix (user, PowerShell).**
```
Remove-Item _tmp_8_*
```

**Acceptance.** Working tree free of scratch files; `.gitignore` covers `_tmp_*` (done).

---

## R8 — No staging gate for a health app 🟡 Medium · S

**What.** Per `CLAUDE.md`, all work commits straight to `main`, and `main` is the Vercel
production branch. CI already references a `develop` branch that isn't used as a gate.

**Why it matters.** Every push ships to production users with PHI — no preview/QA buffer.

**Fix.** Adopt `develop` → Vercel Preview, `main` → Production. Require CI green + review to
merge to `main`. Update `CLAUDE.md`.

**Acceptance.** Production deploys only from reviewed `main` merges.

---

## R9 — Test coverage limited to shared utils 🟡 Medium · M–L

**What.** Good unit tests exist for `packages/shared` (BP classification, adherence, glucose).
There are no RLS policy tests and no API-route/integration tests.

**Why it matters.** RLS is the primary data-protection boundary for PHI; it is currently
unverified by tests. Regressions in a policy would be silent.

**Fix.** Add pgTAP (or `supabase test db`) covering the RLS matrix — owner access, caregiver
`viewer` vs `dose_logger`, anon access to the ICE public view, cross-tenant denial. Add smoke
tests for the surviving API routes. Wire both into CI.

**Acceptance.** CI runs RLS tests; a deliberately broken policy fails the build.

---

## R10 — Vercel cron cadence 🟡→⚪ Low · S

**What.** `/api/cron/reminders` runs every 5 min (288 invocations/day; implies a paid Vercel
plan) and gives up-to-5-min reminder lag with cold-start misfire risk.

**Why it matters.** Cost and reminder precision.

**Fix.** Superseded by R4 — moving to `pg_cron`/Edge removes this entirely. If R4 is deferred,
at least widen the window and de-duplicate sends.

**Acceptance.** Folded into R4.

---

## R11 — Third-party processor residency review ⚪ Low · S

**What.** Resend (email) and Sentry (monitoring) are US-based processors handling
notification content / error context that can include limited personal data.

**Why it matters.** POPIA operator/processor obligations and cross-border transfer apply.

**Fix.** Sign DPAs, scrub PHI from Sentry payloads (already good practice), confirm email
content carries no medical detail, and document each in a processor register.

**Acceptance.** Processor register exists; no PHI in error/telemetry payloads.

---

## R12 — Web/mobile feature parity 🟠 High · L

**Product goal (SALVATOR_ORBIS):** the web app must do everything the mobile app can do.
Measure web against mobile as the baseline. Web is already close — it has medications
(with Take/Skip dose logging, edit, archive), vitals, records, on-device scan (OCR +
barcode), ICE, caregivers, settings, and web-push reminders. The remaining gaps are the
device-native pieces.

**Parity gap register**

| Capability | Mobile | Web | Effort | Notes |
|---|---|---|---|---|
| Dose logging (Take/Skip) | ✅ | ✅ | — | Parity reached. |
| Meds / vitals / records CRUD | ✅ | ✅ | — | Parity reached. |
| On-device scan (OCR + barcode) | ✅ | ✅ | — | Tesseract (web) / ML Kit (mobile). |
| ICE profile + public page | ✅ | ✅ | — | Verify web renders the QR, not just the link. |
| Caregivers | ✅ (partial) | ✅ | — | Web is ahead here. |
| **App lock** (biometric) | ✅ `(auth)/lock` | ✅ PIN + passkey | done | `AppLockProvider` + overlay with idle auto-lock; PIN (salted SHA-256) or WebAuthn passkey; settings in Settings. |
| **Offline-first** | ✅ WatermelonDB | ❌ online-only | L | Make web an installable PWA: cache shell + queue writes + background sync. `sw.js` is currently push-only. |
| **Guided onboarding** | ✅ `(auth)/onboarding` | ✅ `/onboarding` | done | 4-slide intro carousel; linked from landing + Get Started; feeds `login?tab=signup`. |
| **Notifications history** | ✅ `notifications` screen | ✅ `/dashboard/notifications` | done | Aggregates refill alerts + today's missed/pending doses; added to nav. |
| **Medication detail + dose history** | ✅ `medications/[id]` | ✅ `/dashboard/medications/[id]` | done | Hero, 30-day adherence, supply, schedule, details, recent-dose timeline; cards link to it. |
| **Signed capture provenance** | ✅ ed25519 | ⚠️ verify | S–M | Confirm web scans attach the same signed provenance as mobile. |

**Fix.** Treat the ❌/⚠️ rows as a parity backlog. Sequence: notifications history and
medication detail (small, high-value) first; then onboarding and app lock; then offline PWA
(largest — pairs well with the R1 "thin web tier" work since both reshape the web data layer).

**Acceptance.** Every capability above shows ✅ for web; new mobile features land with a web
equivalent in the same milestone.

---

## Suggested sequencing

1. **Sprint 1 (compliance core):** R1 + R4 + R2 + R3 + R10 — one architectural thrust that
   moves PHI processing into `af-south-1`, modernizes auth, and unifies reminders.
2. **Sprint 2 (data integrity):** R5 (sync), R9 (RLS tests), R6 (OCR decision).
3. **Sprint 3 (hygiene/process):** R7, R8, R11.

Items R7 and R8 are S-effort and can be knocked out any time — they don't depend on the rest.

**R12 (parity)** runs as its own parallel track: start with notifications history + medication
detail, and schedule the offline-PWA piece alongside the R1 thin-web-tier rework since both
touch the web data layer.
