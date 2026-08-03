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
| R1 | Web backend runs in London (`lhr1`) while app claims `af-south-1` / POPIA residency | 🔴 Critical (approach set; RLS audit ✅) | L |
| R2 | Server auth used `getSession()` (unverified) instead of `getUser()` | ✅ Done | M |
| R3 | Deprecated `@supabase/auth-helpers-nextjs` — migrate to `@supabase/ssr` | 🟠 High | M |
| R4 | Two overlapping reminder systems (Vercel cron **and** Supabase Edge crons) | 🟠 High | M |
| R5 | Sync bug: vitals pull on `created_at`; no conflict resolution | 🟠 High (filter ✅ / structural ⏳) | M–L |
| R6 | Cloud OCR/Bedrock fallback reintroduces the residency problem | ✅ Done | S–M |
| R7 | Repo hygiene — stale `_tmp_*` files (no git leak; see revised note) | ⚪ Low | S |
| R8 | Everything commits straight to `main` = production; no staging gate | 🟡 Medium | S |
| R9 | Test coverage limited to shared utils — no RLS or API-route tests | 🟡 Medium | M–L |
| R10 | Vercel cron cadence (every 5 min) — cost + up-to-5-min reminder lag | ⚪ Low | S |
| R11 | Third-party processors (Resend, Sentry) not residency-reviewed | ⚪ Low | S |
| R12 | Web/mobile feature parity (product goal) | ✅ Done | L |

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

**Chosen approach (2026-08-03): client-direct + RLS.** A key finding rules out the original
"move to Supabase Edge Functions" idea: **Edge Functions have no `af-south-1` region** — the
supported invocation regions are AP / NA / EU / SA (São Paulo) only, and they default to the
region nearest the caller. So Edge compute would still process PHI outside SA — the same problem
as Vercel/London. What *does* run in `af-south-1` is the project's Postgres, Auth, Storage, and
the **Data API (PostgREST)**. Therefore the residency-correct path is to have the browser call
the af-south-1 Data API directly under RLS, and reserve Edge Functions only for the few
operations that need server secrets (documenting their region).

**RLS audit (2026-08-03) — prerequisite, PASSED.** Confirmed the policies already encode the
authorization the `/api` routes enforce, so client-direct is safe without new policies:
- Own writes: every core table has `FOR ALL USING (profile_id = auth.uid())`, which also gates
  INSERT/UPDATE (WITH CHECK), so a user can only write their own rows.
- Caregiver reads: `… family read USING (is_family_member(profile_id))` (SECURITY DEFINER helper).
- Caregiver writes: the only on-behalf write path in the API is dose logging, and RLS has the
  matching `dose_logs: dose_logger ins WITH CHECK (is_dose_logger(profile_id))`. All other `/api`
  writes insert as the caller's own `profile_id` — already covered by own-CRUD.
- Owner resolution: a caregiver reads their `family_members` row (`family: invitee read`) to find
  `owner_id`, then reads the owner's data under family-read. No server hop required.

**Migration plan (staged).**
1. Flip pure own-write/own-read routes to direct Supabase calls under RLS: `push/subscribe`,
   `push/unsubscribe`, `scan-captures`, `profile`, `vitals`, `medications`, `dose-logs`,
   `documents`, `ice`, `doctor-visits`. Move the routes' input validation into the client using
   `@vitatrack/shared` validators (DB CHECK constraints remain the integrity backstop).
2. Move SSR reads (dashboard pages currently rendered server-side on Vercel/EU) to client-side
   Supabase queries so reads also stay in af-south-1. (Biggest chunk; interacts with the offline
   PWA/SSR model.)
3. Keep only secret-requiring work as Edge Functions — reminder web-push send (VAPID),
   `data-export` ZIP, `send-family-invite` (Resend). Document that these narrow, non-bulk ops
   process transiently in the nearest region.
4. (ICE public-read exposure noted in IMPLEMENTATION_PLAN §3.2 is **already remediated** by
   `20240702000000_phase1_security_fixes.sql` — anon has no base-table SELECT; the page reads via
   the `get_public_ice_profile` RPC. No action.)
5. Update the README to describe the actual data flow. **Done (2026-08-03)** — the README now
   states DB/Auth/Storage/Data API are in af-south-1 while the Vercel web tier currently runs in
   the EU, pending this migration.

Full implementation design (architecture, route map, offline data-layer, sequencing, test plan)
is in **`R1_MIGRATION_DESIGN.md`**. The client-direct data-layer rebuild needs runtime testing and
should be built test-first on a machine that can run the app — not blind-shipped from the static
sandbox.

**Acceptance.** No route that reads/writes `medications`, `vitals`, `documents`, `ice_profiles`,
`dose_logs`, or `profiles` executes outside `af-south-1`; secret-only Edge ops are documented.

---

## R2 — Server authorization trusts unverified sessions ✅ Done (2026-08-03)

**What.** 32 server-side `getSession()` calls across 24 files (API routes, dashboard pages,
layout, middleware) authorized on `session.user.id` read from the cookie **without**
revalidating the JWT against the auth server.

**Done.** Every server-side authorization check now uses `getUser()` (which verifies the token
with Supabase Auth). Migrated all 24 files — `session.user.id`/`.email` → `user.id`/`.email`,
`!session` → `!user`, and the middleware `/dashboard` guard + `/login` redirect. Decoupled from
R3: `getUser()` works on the current client, so no dependency change was needed. All 24 files
pass the syntax check.

**Acceptance.** ✅ No route handler, page, layout, or middleware makes an authorization
decision from `getSession()`; RLS remains the second layer.

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

## R12 — Web/mobile feature parity ✅ Done · L

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
| **Offline-first** | ✅ WatermelonDB | ✅ installable PWA | done | Manifest + installable; versioned SW: offline navigation fallback, SWR `GET /api`, IndexedDB write queue with background-sync replay; offline/sync UI; caches purged on sign-out. See scope note below. |
| **Guided onboarding** | ✅ `(auth)/onboarding` | ✅ `/onboarding` | done | 4-slide intro carousel; linked from landing + Get Started; feeds `login?tab=signup`. |
| **Notifications history** | ✅ `notifications` screen | ✅ `/dashboard/notifications` | done | Aggregates refill alerts + today's missed/pending doses; added to nav. |
| **Medication detail + dose history** | ✅ `medications/[id]` | ✅ `/dashboard/medications/[id]` | done | Hero, 30-day adherence, supply, schedule, details, recent-dose timeline; cards link to it. |
| **Signed capture provenance** | ✅ ed25519 | ✅ WebCrypto ed25519 | done | Web now verifies signed reading-QRs (WebCrypto Ed25519 + `qr_issuer_keys` directory) like mobile, and records `qr`/`scan` method on the `scan_capture` + vital. |

**Status — all rows delivered (2026-08-01 → 08-03).** Notifications history, medication detail,
onboarding, app lock, the offline PWA, and signed-QR capture provenance are built. New mobile
features should continue to land with a web equivalent in the same milestone (standing principle
in `CLAUDE.md`).

**Capture provenance — how web now matches mobile.** The scan-capture audit trail (`scan_captures`
row + `source`/`capture_id` on the vital/document) already existed on both. The missing half was
cryptographic: mobile verifies Ed25519-signed reading-QRs against the `qr_issuer_keys` directory
(via `@noble/ed25519`), while web only parsed QRs structurally and trusted nothing. Web now supplies
a WebCrypto Ed25519 verify primitive (`apps/web/src/lib/qrVerify.ts`) to the same shared verifier,
loads the trusted-key directory from `qr_issuer_keys`, and `ScanClient` grants a valid signature
high confidence / flags an unverifiable QR — identical trust semantics to mobile. Where a browser
lacks WebCrypto Ed25519, verification fails closed to the existing "unverified, manual-review" path
(no regression).

**Offline PWA — scope delivered vs. deferred.**
- _Delivered:_ installable PWA (manifest + icons + metadata + install prompt); versioned service
  worker with network-first navigations and an offline fallback page; stale-while-revalidate
  caching of `GET /api/*` so visited data reads offline; an IndexedDB write queue that captures
  failed `POST/PUT/DELETE /api/*`, returns a "queued" response, and replays via Background Sync
  (with an `online`-event fallback); offline + pending-sync status UI; and cache/queue purge on
  sign-out so no PHI lingers on a shared device.
- _Deferred (by design):_ local-first reads of never-visited routes while offline, and
  field-level conflict resolution. These belong with the R5 structural sync work and the R1
  thin-web-tier rework, which reshape the web data layer. Documented so it isn't mistaken for a gap.

**Acceptance.** ✅ Every capability in the table shows ✅ for web.

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
