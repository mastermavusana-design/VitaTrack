# R1 — Client-Direct Migration: Route-by-Route Build Plan

_Prepared 2026-08-04. Execution companion to `R1_MIGRATION_DESIGN.md` (architecture) and
`REMEDIATION_PLAN.md` (R1). This is the actionable build checklist — what to change, in what
order, and how to verify each step. **Everything is gated behind `NEXT_PUBLIC_CLIENT_DIRECT=1`
and changes nothing in production until the flag is set and the runtime tests in §6 pass.**_

## Goal

No route that reads or writes PHI executes on Vercel (EU/`lhr1`). The browser calls the
`af-south-1` Supabase Data API directly under RLS; only secret-requiring work stays server-side
(and is documented as processing transiently in the nearest region). See design doc §1–2 for why
Edge Functions can't solve this (no `af-south-1` Edge region).

## Enabling foundation (done)

`apps/web/src/lib/dataStore.ts` is the client-side data layer that replaces the R12
service-worker `/api` queue (which can't see cross-origin Supabase calls). It now provides:

- `queuedInsert(table, row)` — client-uuid id for idempotent replay (23505 = already applied).
- `queuedUpsert(table, row, onConflict)` — idempotent by conflict target.
- `queuedUpdate(table, patch, match)` / `queuedDelete(table, match)` — naturally idempotent.
- `resolveOwnerContext()` — caregiver→owner resolution + family role (for dose logging).
- `currentUserId()`, `pendingCount()`, `replayQueue()`, `initClientQueue()`.

Every mutation tries the Data API immediately; on offline/network failure it enqueues to
IndexedDB and returns an optimistic "queued" result, replayed on `online` and on load.

---

## Phase A — Writes (per surface). Status: **built, flag-gated, pending runtime test**

Each row: the UI component, the table + op it now uses client-direct, and the RLS policy that
authorizes it. All keep the `/api` route as the flag-off fallback.

| # | Surface (component) | Table · op | RLS basis | Status |
|---|---|---|---|---|
| A1 | `vitals/AddVitalButton` | `vitals` · insert | own-CRUD | ✅ (pilot) |
| A2 | `medications/MedicationForm` (add) | `medications` + `medication_schedules` · insert | own-CRUD | ✅ |
| A3 | `medications/MedicationForm` (edit) | `medications` · update; `medication_schedules` · delete+insert | own-CRUD | ✅ |
| A4 | `medications/MedCardActions` (Take/Skip) | `dose_logs` · insert | own-CRUD + `dose_logger ins` | ✅ |
| A5 | `medications/MedCardActions` (archive) | `medications` · update (soft-delete) | own-CRUD | ✅ |
| A6 | `records/AddVisitButton` | `doctor_visits` · insert | own-CRUD | ✅ |
| A7 | `records/AddDocumentButton` | Storage upload (already direct) + `health_documents` · insert | own-CRUD + bucket path RLS | ✅ |
| A8 | `scan/ScanClient` (saveVitals) | `scan_captures` · insert + `vitals` · insert | own-CRUD | ✅ |
| A9 | `scan/ScanClient` (saveDocument) | Storage upload + `scan_captures` + `health_documents` · insert | own-CRUD + bucket RLS | ✅ |
| A10 | `dashboard/ice/IceClient` | `ice_profiles` · upsert (`profile_id`) | own-CRUD | ✅ |
| A11 | `lib/push` (enablePush) | `push_tokens` · upsert (`token`) | own-CRUD | ✅ |
| A12 | `lib/push` (disablePush) | `push_tokens` · delete | own-CRUD | ✅ |
| A13 | `settings/SettingsClient` (profile) | `profiles` · upsert | own read/update | ✅ already client-direct (never used `/api/profile`) |

Notes carried into the code:
- Validation that lived in the routes (numeric ranges, enums, name length) moved to the client;
  DB CHECK constraints + RLS remain the integrity backstop, so a bypassed client can't write bad
  or cross-tenant data.
- Dose logging is the only on-behalf write: `resolveOwnerContext()` sets `profile_id = owner`,
  `logged_by = self`, and blocks `viewer` role client-side (RLS `is_dose_logger` is the authority).
- Documents/scans keep the storage upload (already a direct `supabase.storage` call) and only move
  the **metadata** insert off `/api`; on metadata failure the orphaned upload is rolled back.

## Phase B — Reads (SSR → client). Status: **built, flag-gated, pending runtime test**

Dashboard pages currently render server-side on Vercel, so reads leak PHI to the EU too. Each page
is split into a shared **`*View`** (presentational, single source of markup) fed by either the SSR
read (flag off, unchanged behaviour) or a client **`*Client`** wrapper (flag on) that reads via
`cachedSelect`. The page branches on `process.env.NEXT_PUBLIC_CLIENT_DIRECT`.

**Foundation (done):** `dataStore.ts` now has `cachedSelect(cacheKey, run)` — runs the caller's
client-direct query, caches rows in an IndexedDB `reads` store (DB bumped to v2), and serves the
cache when the read fails or the device is offline (the local-first read path the offline-reads
deferral was waiting on). Plus `purgeClientCaches()`, and sign-out now drops the whole
`vitatrack-clientq` DB via `clearOfflineData()`.

Route-by-route (each independently shippable behind the same flag):

1. `dashboard/vitals` → `VitalsView` + `VitalsClient` (`vitals`, caregiver-aware). ✅
2. `dashboard/medications` → `MedicationsView` + `MedicationsClient` (`medications`+schedules, `dose_logs`). ✅
3. `dashboard/records` → `RecordsView` + `RecordsClient` (`doctor_visits`, `health_documents`). ✅
4. `dashboard/ice` → `IceLoader` mounts existing `IceClient` (`ice_profiles`). ✅
5. `dashboard/page.tsx` (home) → `DashboardHomeView` + `DashboardHomeClient` (`medications`, 90d `vitals`, 90d `dose_logs`; caregiver owner-name lookup). ✅
6. `dashboard/notifications` → `NotificationsView` + `NotificationsClient` (active meds + today's pending/missed doses). ✅
7. `dashboard/medications/[id]` → `MedicationDetailView` + `MedicationDetailClient` (med + schedules + 30d dose history). ✅
8. `dashboard/settings` → `SettingsLoader` mounts `SettingsClient`/`ReminderSettings`/`AppLockSettings` (`profiles` read; write already client-direct). ✅
9. `dashboard/caregivers` → `CaregiversView` + `CaregiversLoader` (`family_members` both directions + owner name). ✅
10. `dashboard/layout.tsx` shell → kept server-rendered (auth gate only, no PHI).

**Sign-out purge — done.** `clearOfflineData()` now also drops the `vitatrack-clientq` IndexedDB
(write queue + read cache). It is called on all three sign-out paths: `DashboardNav`,
`AppLockProvider`, and the settings delete-account flow (last one wired in this pass). RLS + the
auth gate remain the authority; the purge just ensures no PHI lingers on a shared device.

## Phase C — Retire `/api` + trim SW. Status: **staged (flag-gated) done; physical cutover deferred**

Done this pass (safe — nothing changes while the flag is off):
- Added `apps/web/src/lib/apiRetired.ts` → `retiredIfClientDirect()`.
- Guarded all 19 handlers across the 11 migrated routes (`vitals`, `medications`,
  `medications/[id]`, `dose-logs`, `doctor-visits`, `documents`, `scan-captures`, `ice`, `profile`,
  `push/subscribe`, `push/unsubscribe`) so that **when `CLIENT_DIRECT` is on they return 410 Gone**
  and process no PHI on Vercel. When the flag is off they run exactly as before (fallback intact).
- This makes the residency guarantee real the moment the flag flips: even a stray/bookmarked call
  to `/api/*` fails closed instead of handling SA health data in the EU.

Deferred to the **final cutover** (do these together, once the flag is permanently ON in prod and
the §6 runtime QA has passed):
- Physically delete the 11 route files.
- Trim the service worker to static-asset + navigation caching + push only. (Not done now because
  with the flag OFF the SW's `/api` write-queue is still the live R12 offline path — trimming it
  early would regress current production.)
- Keep as Edge/server-only (need secrets/service-role): `cron/reminders` (→ Phase D),
  `data-export`, `send-family-invite`, `request-deletion`. Document their region in the README.

## Phase D — R4 reminders → Edge + cron. Status: **replacement built; Vercel cron removal deferred to cutover**

The Vercel cron `/api/cron/reminders` (`*/5`) was the **web-push** sender (browser subscriptions in
`push_tokens`, via the Node `web-push` lib + VAPID). It ran on Vercel/EU and processed PHI outside
`af-south-1` — the last PHI-touching compute on Vercel. (Mobile/Expo reminders are separate:
`refill-daily` + `caregiver-alert` Edge functions, unchanged.)

Done this pass (additive; inert until you deploy it via the Supabase CLI — a Vercel/git push does
nothing to it):
- `supabase/functions/send-reminders/index.ts` — a Deno port of the web-push sender (same
  due-dose + 07:00 refill-sweep logic, per-profile timezone, stale-token pruning), using
  `npm:web-push` and the service role, running in-region.
- `supabase/config.toml` — `[functions.send-reminders] schedule = "*/5 * * * *"` (matches the
  function's 5-minute `WINDOW_MIN`).

**Deploy ordering (do NOT reorder — avoids a reminder gap):**
1. `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:support@vitatrack.app`
2. `supabase functions deploy send-reminders --no-verify-jwt`
3. Verify: invoke it once (`supabase functions invoke send-reminders`) and confirm a test web push
   arrives + the response `{ due, sent, pruned }` looks right. Watch for ~5 min of live sends.
4. **Only then**, cutover — remove the Vercel cron so it stops duplicating/processing PHI in the EU:
   delete the `crons` entry in `apps/web/vercel.json` and delete `apps/web/src/app/api/cron/reminders/route.ts`.

During the brief overlap (both running) users aren't double-notified in practice: web-push payloads
carry a `tag`, so same-tag notifications coalesce rather than stack.

**Why the Vercel cron removal is deferred:** removing it before `send-reminders` is live would stop
web-push reminders. Same staged-safety principle as Phase C — the replacement lands first, the
removal is a coupled cutover step. `pg_cron` note: Supabase schedules these Edge functions from
`config.toml`; no separate `pg_cron` migration is needed unless you prefer DB-driven scheduling.

## Phase E — Honest `vercel.json` + README. Status: **README done; vercel.json region flip at cutover**

Done this pass:
- Rewrote the README **Data residency** note to tell the truth *as it is now*: flag-off (prod
  default) still processes some PHI on Vercel/EU; flag-on runs client-direct to `af-south-1` with
  the `/api/*` routes failing closed and web-push moved to the `send-reminders` Edge function; Vercel
  then serves only the shell + auth. Documented the staged rollout and linked the R1 docs. Also
  updated the `apps/web` / `supabase` monorepo rows, an Environment note for the flag, and the
  `send-reminders` deploy steps.

Deferred to the **cutover**:
- `apps/web/vercel.json` regions. `vercel.json` is strict JSON (no comments), and the "web is
  shell-only" claim is only true post-cutover, so the region value is left as-is until then rather
  than misrepresenting current behaviour. At cutover, drop/retarget `"regions": ["lhr1"]` alongside
  removing the `crons` entry.

## Cutover checklist (run once the flag is ON in prod + §6 QA passed)

1. Confirm `NEXT_PUBLIC_CLIENT_DIRECT=1` in the Vercel project env, and a full runtime QA pass.
2. Deploy `send-reminders` (+ VAPID secrets); verify web push fires in-region.
3. Delete the 11 retired `/api` route files (+ the `apiRetired` guard once unused).
4. Delete `apps/web/src/app/api/cron/reminders/route.ts` and the `crons` entry in `vercel.json`;
   set `regions` honestly.
5. Trim the service worker to static/nav/push only (drop the `/api` SWR + write-queue logic).
6. Re-run type-check + the QA smoke; confirm no `/api/*` PHI calls remain.

---

## §6 Runtime test checklist (required before flipping the flag)

Run locally / on preview with `NEXT_PUBLIC_CLIENT_DIRECT=1`:

- **Writes online:** add a vital, medication (+schedule), edit a med, Take/Skip a dose, archive a
  med, add a visit, upload a document, scan a reading + a document, save ICE, enable/disable
  reminders — each lands in the correct `af-south-1` table (verify in Supabase).
- **Offline enqueue → replay:** go offline, create a vital → "queued"; reconnect → row appears;
  kill the tab mid-queue → replays on next load; double-replay produces **no duplicate** (uuid/23505).
- **RLS deny (cross-tenant):** as user B, confirm you cannot read or write user A's rows.
- **Caregiver:** a `dose_logger` can log a dose for the owner; a `viewer` is blocked; neither can
  edit meds/vitals.
- **Provenance:** a scanned reading records `scan_captures` + `capture_id` + `source` on the vital.
- **Network tab:** confirm PHI mutations go to `https://<ref>.supabase.co` (af-south-1), **not** to
  `/api/*` on the Vercel origin.

## §6a Automated data-layer tests (done)

`apps/web/test/dataStore.test.ts` (vitest, jsdom) runs the **real** `src/lib/dataStore` against an
in-memory IndexedDB + Supabase stub (`test/setup.ts`, `test/supabaseStub.ts`) — no live backend or
browser needed. Run with `pnpm --filter @vitatrack/web test`. Coverage (13 cases, all green):

- insert online applies + attaches a client uuid; offline enqueues and replays **exactly once**.
- replay drops a duplicate (23505) and other permanent errors; **keeps** a transient (no-code) error.
- update / delete / upsert enqueue offline and replay with their match / onConflict intact.
- `cachedSelect` returns live rows online (and caches them) and serves the cache offline.
- `purgeClientCaches` clears both the write queue and read cache.
- `resolveOwnerContext` acts as self with no membership, resolves owner + role for a caregiver.

These cover the queue/replay/idempotency/cache logic. They do **not** replace §6 — real RLS, real
offline, and cross-origin routing still need the running app.

## §7 Verify before ship (this build)

- [x] Automated data-layer tests pass (§6a) — `pnpm --filter @vitatrack/web test`.
- [ ] `pnpm --filter @vitatrack/web type-check` passes (run on a dev machine; too slow over the
      Windows mount in the sandbox — every touched file passes an isolated TS transpile check).
- [ ] With the flag **off**, the app behaves exactly as before (all `/api` fallbacks intact).
- [ ] Then run §6 (browser + RLS + offline) with the flag on before enabling anywhere shared.
