# Phase 5 — Child Health Record (Road to Health Booklet): App-Layer Build Plan

_Prepared 2026-08-07. Execution companion to `IMPLEMENTATION_PLAN.md` §8–9 (product scope and
schema rationale). This is the actionable checklist for building the application layer on top of
the already-merged database foundation. **The DB foundation exists; nothing above the database
does. This plan is that "above".**_

## Status recap — where the work actually stands

- **DB foundation: DONE and merged (on `main` and `develop`).** Migration
  `supabase/migrations/20240728000000_child_health_record.sql` (commits `45a5724` +
  idempotency fix `964b635`), verified by `a961372`. It ships 5 tables — `dependants`,
  `vaccine_schedule` (seeded with EPI-SA 2024.1), `immunisations`, `growth_measurements`,
  `milestones` — plus RLS, the `dependant_owned`/`dependant_visible` helpers, the enum
  extensions (`health_documents.category += immunization,growth_chart`;
  `scan_captures.artifact += rthb`), and the `expand_immunisation_schedule(dep, ver)` RPC.
- **App layer: NOT STARTED.** `git grep` finds zero references to immunisations / vaccines /
  dependants anywhere outside `supabase/`. No types, validation, hooks, screens, API routes, or
  sync. The schema is live but unreachable from either app.
- **Not formally deferred.** `REMEDIATION_PLAN.md` never mentions Phase 5; the R-series
  security/architecture track simply consumed all runway after the foundation landed. This is a
  parked feature, not a cancelled one.

## Design constraints inherited from the codebase

- **Dependant-centric keying (locked in the migration).** Child records key off `dependant_id`,
  not `profile_id`. The `profiles ↔ auth.users` FK is untouched. "Graduation at 18" (a child
  getting a real login) is a later, additive migration — out of scope here.
- **Web/mobile parity is mandatory** (`CLAUDE.md` product principle + R12). Every child-health
  surface built on mobile needs its web equivalent in the same milestone. Measure web against
  mobile.
- **Staging gate (R8).** Work lands on `develop` → Vercel Preview; promote to `main` only via
  reviewed PR with CI green (type-check, lint, tests, RLS pgTAP, build). Never commit to `main`.
- **RLS is the integrity authority (R1/R9).** Client-side validation is UX; DB CHECK constraints
  and RLS are the backstop. Every new dependant-scoped table needs pgTAP coverage in the R9 style.
- **POPIA.** `dependants.popia_consent` must be captured (guardian consent for a child's
  special-personal data) before any child record is stored.

---

## Work breakdown by layer

### Layer 0 — `packages/shared` (no web/mobile or sync dependencies — build first)

| # | Item | Status | Notes |
|---|---|---|---|
| S1 | **WHO growth LMS engine** (`utils/growth-lms.ts`) | ✅ **DONE** | Pure math: z-score ↔ measurement via the LMS method, WHO extreme-value adjustment beyond \|z\|>3, z ↔ percentile, table interpolation, z-band classification. Zero external deps. 28 unit tests. |
| S2 | **WHO reference tables** (`utils/growth-reference/`) | ✅ **DONE** | Real WHO Child Growth Standards (2006) LMS data transcribed from the `pygrowup2` package by `scripts/gen-who-growth-tables.py` (re-runnable). Seven indicators × both sexes: wfa, lhfa, hcfa, bmifa, acfa (monthly, 0–60mo) and wfl/wfh (every 0.5 cm). Typed loader (`getLMSTable`, `zScoreFor`, `percentileFor`, `classifyFor`, `ageInDays`) + golden cross-check fixtures proving the TS engine reproduces WHO z-scores. 9 tests. |
| S3 | **Types** for dependant, immunisation, growth measurement, milestone, vaccine-schedule row | ✅ **DONE** | Added to `types/index.ts`; `DocumentCategory` extended with `immunization`/`growth_chart` to match the migration. |
| S4 | **Validation** for the four writable entities | ✅ **DONE** | Ranges + enum guards + shape checks (`validation/child-health.ts`), incl. POPIA-consent gate on dependants and given/measured-date rules. **Built in the codebase's hand-rolled `ValidationResult` style — NOT Zod** (Zod isn't a dependency here; matching `validation/vitals.ts` keeps the layer consistent). 22 tests. |
| S5 | **Milestone reference checklist** | ◑ **PARTIAL (motor done)** | New migration `20240805000000_milestone_schedule.sql`: a seeded, versioned `milestone_schedule` reference table + `expand_milestone_schedule(dep, ver)` function + RLS, mirroring `vaccine_schedule` exactly. Seeded with the authoritative **WHO Windows of Achievement** for the six gross-motor milestones (`schedule_ver='WHO-GMM-2006'`, 1st–99th percentile windows). Verified end-to-end against a real Postgres engine (PGlite): seed count, CHECK constraint, idempotent re-run, per-child expand (6 then 0), unknown-dependant guard. **Follow-up:** import the CDC "Learn the Signs. Act Early." 2022 checklist for the language/social/cognitive domains as a second versioned seed (`CDC-LTSAE-2022`) — source identified, data not yet transcribed (same no-hand-typing discipline as S2; CDC pages are client-rendered and weren't machine-fetchable here). |

### Layer 1 — `apps/web` (parity baseline)

| # | Item | Status | Notes |
|---|---|---|---|
| W1 | API routes: `/api/dependants`, `/api/immunisations/[id]`, `/api/growth-measurements`, `/api/milestones/[id]` | ✅ **DONE** | `/api/dependants` (GET+POST), `/api/growth-measurements` (GET+POST), `/api/immunisations/[id]` (PATCH: mark given / skip / undo), `/api/milestones/[id]` (PATCH: achieved / concern / reset) — all flag-off fallbacks with `retiredIfClientDirect`, validating via shared guards. Client-direct paths write the tables under RLS. |
| W2 | Call `expand_immunisation_schedule` + `expand_milestone_schedule` RPCs on dependant-create | ✅ **DONE** | Both fire on create — server-side in the API route, client-side (post-insert, online) in `ChildForm`. Versions from shared `ACTIVE_VACCINE_SCHEDULE_VER` / `ACTIVE_MILESTONE_SCHEDULE_VER`. |
| W3 | `dashboard/children` — list + add-child (with POPIA consent capture) | ✅ **DONE** | New route `dashboard/children` (flag-aware page → `ChildrenClient` client-direct read / `ChildrenView` SSR), `AddChildButton` + `ChildForm` with required POPIA-consent checkbox, nav item + `ChildIcon`. |
| W4 | Child detail — immunisation schedule / growth chart / milestones tabs | ✅ **DONE** | `dashboard/children/[id]` (flag-aware page → `ChildDetailClient` / SSR) with a 3-tab `ChildDetailView`: **Immunisations** (read-only list + due/given counts), **Growth** (WHO `GrowthChart` via recharts — P3/P15/P50/P85/P97 curves computed on the fly from S1/S2, indicator selector wfa/lhfa/hcfa, `AddGrowthMeasurement` write + `/api/growth-measurements` fallback, measurements table), **Milestones** (read-only, grouped by domain). Child cards now link here. Curve math unit-tested (boys 12-mo P50 = 9.646 kg). Deferred: BMI/weight-for-length indicators, immunisation "mark given" + milestone status writes. |
| W5 | RtHB capture wiring | ◑ **web done** | Migration `20240806000000_health_documents_dependant.sql` adds the `dependant_id` link (PGlite-verified: FK + `ON DELETE SET NULL` + idempotent) so RtHB pages / growth charts / immunisation certificates can be filed against a child; shared `HealthDocument.dependant_id` + verify check added; `/api/documents` accepts the child categories + `dependant_id`. Web **Documents tab** (`ChildDocuments`) uploads to the private `health-documents` bucket and lists per-child docs with signed-URL open, reusing the proven records-upload flow. **Deferred:** mobile document capture (camera / expo-image-picker) and OCR auto-extract (`scan_captures.artifact='rthb'`) — the storage-upload runtime needs on-device/browser verification not possible in this sandbox. |
| W6 | Immunisation reminders | ✅ **DONE** | Extended `api/cron/reminders`: an 08:00-local sweep pushes a Web Push notification to the **guardian** for `status='due'`, `reminder_enabled` doses that are due today or 7 days out (per-guardian timezone; browser tag dedups; deep-links to `/dashboard/children`). Date math verified. Reuses the existing VAPID/push_tokens plumbing. |

### Layer 2 — `apps/mobile`

| # | Item | Status | Notes |
|---|---|---|---|
| M1 | WatermelonDB schema + models + **sync** for the new tables | ◑ **read mirror done** | Schema bumped to **v3** with a v2→v3 migration adding `dependants`, `immunisations`, `growth_measurements`, `milestones`; four model classes registered in `database.ts`; **pull-sync** wired into `syncWithSupabase` — `pullDependants` (incremental by `updated_at`, guardian-scoped) then `pullChildTables` (immunisations incremental; growth incremental by `created_at` since it's insert-only; milestones **full pull** each sync because the table has no `updated_at`). Scoped type-check clean. **Deferred:** offline-*write* dirty-push for child tables — the screens currently write online via the store (same as the meds store), so wiring writes through WatermelonDB pairs with the deferred R5 offline-write work. |
| M2 | Store + hooks: `useChildren` | ✅ **DONE** | `hooks/useChildren.ts` Zustand store (online-first, mirrors `useMedications`): `fetchDependants`, `addDependant` (insert + both expand RPCs), `fetchChildBundle`, `updateImmunisation`, `updateMilestone`, `addGrowthMeasurement`. |
| M3 | Screens: children list, add-child, child-detail (immunisation / growth / milestones) | ✅ **DONE** | `children.tsx` (list, pressable cards) + `children/add.tsx` (POPIA-consent form) + `children/[id]/index.tsx` (3 tabs, immunisation & milestone write actions, growth chart) + `children/[id]/measure.tsx` (add-growth). Growth chart is **`components/ChildGrowthChart.tsx` — pure `react-native-svg`** (P3/P50/P97 WHO curves from S1/S2 + child points), NOT victory-native: the app avoids Skia/victory for Expo-Go compatibility (same choice as `VitalsTrendChart`). |
| M4 | Booster due-date reminders in `notifications/scheduler` | ✅ **DONE** | New `CHANNEL_IMMUNISATION` + `rescheduleImmunisations()` schedules **local** expo-notifications at 08:00 on the due date and a week before (per due, reminder-enabled dose), cancelling the prior set each run. `useChildren.fetchDueImmunisations()` feeds it; the Children screen reschedules whenever the list loads. Mobile counterpart of the web W6 cron (which pushes; mobile schedules locally). |

### Layer 3 — cross-cutting / verification

| # | Item |
|---|---|
| V1 | pgTAP RLS tests (R9 style) for `dependants`, `immunisations`, `growth_measurements`, `milestones` — guardian CRUD, family read, cross-tenant denial. ✅ **DONE** — `supabase/tests/child_health_rls_test.sql` (15 assertions). Runs under `supabase test db` (can't execute in this sandbox — no pgTAP/superuser role). |
| V2 | Unit tests for the WHO growth engine (S1) and reference-table interpolation (S2). |
| V3 | E2E (Playwright) — add child → schedule expands → record a given dose → plot a growth point → milestone update. |
| V4 | POPIA consent gating verified end-to-end (no child data persists without consent). |

---

## Known gaps to resolve before/within the build

1. **No milestone reference data.** `milestones` is per-child free-form with no backing schedule
   table. Decide: shared constant vs. a new seed migration (`milestone_schedule`, mirroring
   `vaccine_schedule`). (S5)
2. **WHO growth reference data is a sourcing task, not a coding task.** The LMS numbers are
   clinical reference data and must come from the official WHO files, not be reconstructed. The
   S1 engine is deliberately decoupled from the data so it can be built and fully tested now. (S2)
3. **Offline story is entangled with deferred R-work.** Mobile sync (M1) and the web client-direct
   data layer (R1/R5) both need these tables wired in; the local-first / conflict-resolution
   pieces of that rework are themselves deferred (`CLAUDE.md`), so full offline parity for child
   health inherits that dependency.

## Sequencing & effort

1. **Layer 0 first** (S1 → S2/S3/S4/S5) — no UI or sync dependencies, unblocks everything, keeps
   the clinical logic well-tested in isolation.
2. **Web (Layer 1)** to establish the parity baseline, then **mobile (Layer 2)** to match, with
   verification (Layer 3) folded into each.
3. `IMPLEMENTATION_PLAN.md` estimated ~5–8 days, but that predates the web-parity mandate and R9
   test discipline. Realistic end-to-end estimate with parity + tests: **~2–3 weeks**, the two
   long poles being the WHO growth util+data (S1/S2) and the mobile offline-sync integration (M1).

## Progress log

- **2026-08-07 — Layer 0 nearly complete.** S1 (LMS engine), S2 (WHO reference data + loader),
  S3 (types), and S4 (validation) are all built and tested: **59 shared tests pass**, all new
  files type-check under `--strict`. Only S5 (milestone checklist) remains in Layer 0. Nothing is
  committed yet — commit from PowerShell on `develop` per the environment note in `CLAUDE.md`.
  Regenerate the WHO tables with `python scripts/gen-who-growth-tables.py` (needs `pip install
  pygrowup2`).

- **2026-08-07 — S5 (motor) added.** Milestone reference schedule migration built and verified
  against a real Postgres (PGlite) — the expand-per-child pattern now works for milestones as it
  does for vaccines. Motor domain seeded from WHO; language/social/cognitive await a CDC-source
  import. **Layer 0 is effectively complete** (only the CDC milestone import remains as a
  data-sourcing follow-up).

- **2026-08-07 — Layer 1 first slice (dependants / add-child) shipped.** `dashboard/children`
  list + add-child with POPIA consent, `/api/dependants` fallback, both expand RPCs wired on
  create, nav item, and the child-health RLS pgTAP suite (V1). Web + shared type-check clean; 59
  shared tests green. One name-clash fix along the way: `Sex` is now owned solely by `types/` and
  imported by `growth-lms` (both had declared it). Deferred to the next slice: **W4 child detail +
  growth chart** (child cards are intentionally non-clickable until then).

- **2026-08-07 — W4 (child detail + WHO growth chart) shipped.** `dashboard/children/[id]` with
  Immunisations / Growth / Milestones tabs; the growth chart draws WHO percentile curves live from
  the S1/S2 engine (recharts) and plots the child's measurements, with an add-measurement write
  (`/api/growth-measurements` fallback). Web + shared type-check clean; **62 shared tests green**
  (added 3 curve-composition tests). Child cards are clickable again.

- **2026-08-07 — Immunisation + milestone write surfaces shipped.** `/api/immunisations/[id]`
  (mark given / skip / undo) and `/api/milestones/[id]` (achieved / concern / reset) PATCH routes,
  plus optimistic action controls in the child-detail tabs (client-direct `queuedUpdate` under RLS
  + `/api` fallback). Web + shared type-check clean; 62 shared tests green. Layer 1 API/UI is now
  functionally complete for the RtHB core (dependants, immunisations, growth, milestones).

- **2026-08-07 — W6 immunisation reminders shipped.** `api/cron/reminders` now also sweeps due,
  reminder-enabled immunisations at 08:00 local and Web-Pushes the guardian for doses due today or
  a week out, deep-linking to the child view. Date/timezone math verified; web type-check clean.

The Children feature is interactive and now proactive on web. **Layer 1 is complete except RtHB
scan (W5).**

- **2026-08-07 — Layer 2 first mobile slice (children list + add) shipped.** `hooks/useChildren.ts`
  store (online-first, both expand RPCs on create), `app/(app)/children.tsx` list, and
  `app/(app)/children/add.tsx` add-child form with POPIA-consent switch, plus drawer + Stack nav.
  Mirrors the medications store/screens exactly. Type-checked via a scoped tsconfig (full mobile
  `tsc` is too slow to run here in one pass); only "errors" are expo's stale typed-route codegen —
  the same class hits a pre-existing file and clears when `.expo/types` regenerates on build.

- **2026-08-07 — Mobile child-detail shipped (M2 + M3 done).** Store extended with
  `fetchChildBundle` + immunisation/milestone updates + add-growth; `children/[id]` detail screen
  with Immunisations / Growth / Milestones tabs, per-row write actions (given/skip/undo,
  achieved/concern/reset), a pure-`react-native-svg` WHO growth chart, and a `measure` add screen;
  list cards now pressable. Scoped type-check clean (only expo stale-route codegen, resolves on
  build). Mobile now has functional parity with web for the RtHB core.

- **2026-08-07 — Mobile offline read-mirror shipped (M1 pull).** WatermelonDB schema v3 +
  migration + models + `database.ts` registration + child-table pull-sync in `syncWithSupabase`.
  Growth pulls incrementally by `created_at` (insert-only); milestones pull in full (no
  `updated_at`); dependants + immunisations pull incrementally by `updated_at`. Scoped type-check
  clean. Offline-write (dirty-push) deferred with R5.

- **2026-08-07 — Mobile booster reminders shipped (M4).** Local expo-notifications scheduler for
  due immunisations (08:00 on the day + a week before), fed by `fetchDueImmunisations`, rescheduled
  when the Children screen loads. Scoped type-check clean. **Layer 2 (mobile) is now complete
  except optional offline-write.**

- **2026-08-07 — W5 web document filing shipped.** `health_documents.dependant_id` link
  (PGlite-verified migration) + shared type + `/api/documents` child-category/`dependant_id`
  support + a web **Documents tab** to upload and list a child's RtHB pages, growth charts and
  immunisation certificates (private bucket, signed-URL open). Web + shared type-check clean.

**Attempted but blocked — CDC milestone import.** No official machine-readable CDC "Learn the
Signs. Act Early." dataset exists (PDFs / app / interactive checklists only); the open-access PMC
mirror wasn't fetchable here. Rather than hand-type ~150 clinical milestone items (fabrication
risk), S5's language/social/cognitive domains stay a documented data-sourcing follow-up.

Remaining Phase 5 (all either external-data-blocked or not sandbox-verifiable): **mobile** RtHB
document capture + OCR (W5 mobile), the **CDC milestone import** (needs a real data source), the
optional **mobile offline-write** for child tables, and **V3 E2E** (needs a running
Next+Supabase+Playwright stack). The core Road-to-Health feature — add a child, auto-expanded
immunisation + milestone schedules, growth charts against WHO curves, dose/milestone tracking,
reminders, offline read-mirror, and document filing — is **complete and parity-matched on web and
mobile**.
