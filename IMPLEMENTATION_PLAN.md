# VitaTrack — Implementation Plan

_Draft prepared 27 July 2026. Target build location: `C:\Dev\vitatrack`._

---

## 1. Verdict: is what's there "enough" for this app?

**Yes — as a foundation, comfortably.** This is not a skeleton or a prototype. It is a coherent, ~10,000-line, three-surface product (mobile app, web companion, backend) with a mature data model, real offline-first sync, working background jobs, and privacy/compliance built in from day one (POPIA, `af-south-1` region, audit logging, RLS on every table).

What's left is **finishing and hardening to a launchable product**, not architecting one. The gaps are concrete and bounded: one build blocker, a handful of correctness/security fixes, some feature completion, and the usual pre-launch work (tests, CI green, store submission). None of it requires rethinking the design.

So: the codebase is enough to build **on**. It is not yet enough to **ship** — this plan closes that distance.

---

## 2. What already exists

**Monorepo** — pnpm workspaces + Turbo. Node ≥ 20, pnpm 9.

| Surface | Stack | State |
|---|---|---|
| `apps/mobile` | Expo 54 / React Native 0.81, expo-router, WatermelonDB (offline), NativeWind, Reanimated | Full screen set: auth (login/register/onboarding/biometric lock), meds (list/add/log), vitals (list/add), records + visit-add, profile, ICE. Local notification scheduler. Supabase sync adapter. |
| `apps/web` | Next.js 14 App Router, Supabase auth-helpers, TanStack Query, Recharts, Tailwind | Login, dashboard (meds/vitals/records/caregivers/settings), public ICE page `/ice/[token]`, caregiver invite accept flow, 5 API routes, session middleware. |
| `packages/shared` | TypeScript | Shared types, Supabase client factory, and clinically-informed utils: WHO/ESH 2023 BP classification, adherence + streak logic, glucose unit conversion, medication constants. |
| `supabase` | Postgres + Edge Functions (Deno) | 2 migrations (full schema + helpers). 4 functions: `caregiver-alert` (cron 10m), `refill-daily` (cron daily), `send-family-invite` (Resend email), `data-export` (POPIA data access ZIP). |
| CI | GitHub Actions | typecheck, lint, shared tests, web build, Expo export, DB migration lint. |

**Data model (11 tables):** `profiles`, `family_members`, `medications`, `medication_schedules`, `dose_logs`, `vitals`, `doctor_visits`, `documents`, `ice_profiles`, `push_tokens`, `audit_logs` — all with RLS policies, caregiver ("family member") sharing roles (`viewer` / `dose_logger`), auto-profile-on-signup trigger, pill-count decrement trigger, and adherence/refill views.

---

## 3. Gap analysis

Ordered by severity. Items marked **[blocker]** stop a build or a store submission; **[correctness]** produce wrong or unsafe behaviour; **[polish]** are quality/consistency.

### 3.1 Build & tooling

- **[blocker] Missing notification sound asset.** `apps/mobile/app.config.js` registers `expo-notifications` with `sounds: ['./assets/sounds/notification.wav']`, but `assets/sounds/` is empty. EAS build will fail. → Add the `.wav` (or drop the `sounds` key and rely on the default channel sound).
- **[blocker] CI `test-shared` job will fail — there are zero test files.** The workflow runs `pnpm --filter @vitatrack/shared test --coverage`, but no `*.test.ts` exists anywhere. Either add tests (recommended — the utils are pure and highly testable) or the pipeline stays red.
- **[blocker] CI `db-check` has a wrong working directory.** `supabase db lint` runs with `working-directory: vitatrack`, which assumes the repo is checked out into a nested `vitatrack/` folder. After you move to `C:\Dev\vitatrack` as the repo root, this path won't exist. → Set `working-directory: .` (or remove it).
- **[polish] `app.json` and `app.config.js` disagree.** `app.json` points icons at `./assets/*` and references a `reminder.wav`; `app.config.js` correctly uses `assets/images/*` and `notification.wav`. Expo prefers `app.config.js`, so `app.json` is dead/misleading. → Delete `app.json`, keep the JS config as the single source.
- **[polish] Not under version control.** No `.git`, no root `.gitignore`, no `README`. → `git init` in `C:\Dev\vitatrack`, add `.gitignore` (node_modules, .next, .expo, .env*, dist, coverage), write a README from `setup.sh`.

### 3.2 Correctness & security

- **[correctness] ICE public page leaks all medical fields to anonymous users.** The RLS policy `ice: public read USING (is_public = TRUE)` plus `GRANT SELECT ON ice_profiles TO anon` exposes **every** column — allergies, conditions, current medications, DNR status — to anyone with (or guessing) the table access, not just the intended QR fields. The schema author left a comment warning about exactly this but didn't implement the guard. → Create a restricted public **view** (or security-definer RPC) that returns only the QR-appropriate subset keyed by `qr_token`, revoke anon SELECT on the base table, and point `/ice/[token]` at it.
- **[correctness] Two audit tables — schema inconsistency.** The main migration creates `audit_logs` (plural, with `actor_id`/`target_profile_id`); the helpers migration creates a second `audit_log` (singular), and `data-export` reads from `audit_log`. Pick one. → Standardise on a single table; update the function and any writers.
- **[correctness] Sync `lastSyncedAt` is not persisted.** In `db/sync.ts` it's a module-level variable that resets to epoch on every app restart, forcing a full re-pull each launch (bandwidth + battery). → Persist to `expo-secure-store`/AsyncStorage as the code comment itself notes.
- **[correctness] Sync coverage is partial and has no conflict resolution.** Only vitals, medications, and dose_logs sync; `doctor_visits`, `documents`, and `ice_profiles` do not sync offline. Push is last-write-wins with no deletion propagation for meds/visits. → Decide the offline scope (see Phase 2) and add soft-delete + updated-at conflict handling.
- **[polish] Env var naming isn't consolidated across surfaces.** Edge `send-family-invite` reads `WEB_BASE_URL`; web `.env.example` defines `NEXT_PUBLIC_APP_URL` + `NEXT_PUBLIC_ICE_BASE_URL`; root `.env.example` uses yet another mix. → Write one canonical env matrix (below) and align all three.
- **[polish] Real anon key committed in `apps/mobile/.env`.** The Supabase anon key is public by design so the risk is low, but committing environment files is a bad default. → Add `.env*` to `.gitignore`; keep only `.env.example` in git.

### 3.3 Feature completeness (to verify against product intent)

These exist in the schema/backend but need a UI/flow check before calling them done: document upload to Supabase Storage (table + web category exist; confirm mobile capture → upload → signed-URL retrieval works end-to-end), caregiver `dose_logger` write path, push-token registration writing to `push_tokens`/`profiles.expo_push_token` (the cron functions depend on it), and the `data-export` ZIP actually generating and emailing.

### 3.4 Vision-coverage gaps (product vision vs. schema)

Section 3.1–3.3 covers *hardening what's built*. This section covers *what the vision promises but the schema does not yet deliver*. Mapping the nine advertised pillars against the actual data model:

| Pillar | Status | Where it lives today |
|---|---|---|
| Medication reminders | ✅ Strong | `medication_schedules` + dose materialization + local/push notifications + `caregiver-alert`/`refill-daily` cron |
| Vital signs | ✅ Strong | `vitals` (BP, glucose, weight, temp, SpO₂, HR) + scan-capture provenance |
| Doctor visits | ✅ Strong | `doctor_visits` (diagnosis, treatment, follow-up, document links) |
| Lab results | ✅ Good | `lab_results` (analyte, LOINC, value, reference range, abnormal flag, source) |
| Prescriptions | ⚠️ Thin / conflated | Split between `medications` ("what I take") and `documents.category = 'prescription'` (a scanned file). No true prescription entity (Rx number, pharmacy, refills authorized, prescriber practice number). |
| Medical history | ⚠️ Thin | `doctor_visits` (free text) + `ice_profiles.conditions[]` (free-text array on the emergency card). No structured problem/condition list. |
| Allergies | ⚠️ Emergency-only | Only `ice_profiles.allergies TEXT[]`. Free text, no reaction/severity, no drug-allergy cross-check. |
| Vaccinations | ❌ Missing | No table. `documents.category` enum cannot even file an immunization record. |
| Wearable integration | ❌ Missing | Only a free-text `vitals.device` column; `source` enum has no device-stream value. No HealthKit / Health Connect / Fitbit / Garmin ingest. |

Four pillars are genuinely delivered, three are thin, two are absent. The full build-out of the missing pillars — plus the **child health record** (Road to Health Booklet) direction — is scoped in Phase 5 and detailed in §8–9.

Priority within the gap set (safety- and market-value-weighted):

1. **Allergies** as a first-class table + drug-allergy check at medication-add time — safety-critical for a med tracker, small effort.
2. **Conditions / problem list** — the missing backbone of "medical history"; allergies, meds, and visits should reference it.
3. **Child health record / vaccinations** — see §8; high market value in SA, self-contained.
4. **Prescriptions** — decide whether it's a clinical/legal record or just the med list (§9.4).
5. **Wearables** — the one genuine epic; a candidate to *explicitly defer* out of v1 rather than half-build.

---

## 4. Recommended scope & phasing

You asked me to recommend the bar. **Recommendation: drive to a POPIA-compliant public launch (SA market), in five phases.** Phases 0–1 are non-negotiable and fast; 2–4 are where most effort sits. Each phase ends in a shippable, greener state.

### Phase 0 — Relocate & get green (0.5–1 day)
Establish the new repo and a clean build before touching features.
1. Move source to `C:\Dev\vitatrack`; **do not copy `node_modules`** — fresh `pnpm install` (the OneDrive-installed modules are what corrupted the previous setup).
2. `git init`, add `.gitignore` + README.
3. Fix the build blockers: add `notification.wav`, delete `app.json`, correct the `db-check` working directory.
4. Run `pnpm install && pnpm type-check && pnpm build` locally; confirm Expo `expo start` boots and web dev server runs.

**Exit:** clean install, type-check + web build pass, both apps start.

### Phase 1 — Correctness & security fixes (1–2 days)
5. ICE public-view restriction (highest priority — medical data exposure).
6. Reconcile the audit table duplication.
7. Persist `lastSyncedAt`; verify sync round-trips after restart.
8. Consolidate env vars; move secrets out of git.

**Exit:** no anonymous medical-data exposure; single audit table; sync survives restart.

### Phase 2 — Feature completion (3–5 days)
9. Verify and finish document upload (Storage bucket + policies + mobile capture flow + signed URLs).
10. Finish offline sync scope decision (recommend: add `doctor_visits` + soft-delete propagation; leave `documents` online-only for v1).
11. End-to-end caregiver flow: invite → email → accept → `dose_logger` writes a dose → patient sees it → `caregiver-alert` fires on a missed dose.
12. Push-token registration verified on a real device (cron functions are useless without it).

**Exit:** every advertised feature works end-to-end on a physical device.

### Phase 3 — Quality & hardening (2–4 days)
13. Unit tests for `packages/shared` (BP classification, adherence/streak, glucose conversion) — pure functions, fast wins, and they unblock CI.
14. Add error monitoring (Sentry DSN placeholders already exist in env).
15. Input validation pass on web API routes (they validate presence but not ranges — reuse the shared classifiers' physiological bounds).
16. Get all CI jobs green.

**Exit:** CI fully green, tests cover core clinical logic, errors are observable.

### Phase 4 — Launch readiness (2–3 days + review lead time)
17. EAS production build profiles; app store assets (icon/splash already present), privacy policy + POPIA data-handling disclosure (data-export function supports the "right of access" obligation).
18. Deploy web (Vercel) + Supabase project (prod, `af-south-1`); wire cron schedules from `config.toml`.
19. Store submission (iOS review ~1–3 days, Android faster).

**Exit:** submitted to stores, web live, backend in production.

**Rough total:** ~9–15 working days to launch-ready, dominated by Phases 2–4. Phases 0–1 (the "make it correct and safe" work) are ~2–3 days and I'd do them first regardless of how far you take the rest.

### Phase 5 — Vision expansion: child health record & missing pillars (post-v1, ~10–18 days)
This is a **v1.x product expansion**, not launch-blocking. It closes the gaps in §3.4 and adds the child health record (§8). Sequence by value and effort:

20. **Allergies + conditions** (2–3 days). Add `allergies` and `conditions` tables (§9.1–9.2), migrate the free-text `ice_profiles` arrays into them (keep the ICE card as a derived/denormalized view), and add a drug-allergy check on the medication-add flow.
21. **Dependants model** (1–2 days). Add managed child profiles a guardian owns outright (distinct from adult-to-adult `family_members` sharing) — see §8.1. This is the prerequisite for everything child-related.
22. **Vaccinations + Road to Health Booklet** (4–6 days). Immunization schedule, growth monitoring, and milestones (§8.2–8.4); reuse the camera-capture pipeline to digitize physical RtHB pages and the scheduler for booster due-dates.
23. **Prescriptions decision** (1–3 days). If choosing the clinical-record path, add the `prescriptions` entity (§9.4) and link `medications` to it.
24. **Wearables** (5–8 days, or defer). HealthKit / Health Connect read integration + one cloud provider (Fitbit or Garmin) with dedup and stream-aware storage (§9.5). Decide explicitly whether this is in v1.x or a later milestone.

**Exit:** child health record usable end-to-end (add a child → record/scan vaccines → see growth chart → get booster reminders); allergies and conditions structured with a drug-allergy check; a clear, documented decision on prescriptions and wearables.

---

## 5. Canonical environment matrix (to standardise in Phase 1)

| Variable | mobile | web | edge functions | Notes |
|---|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ (`SUPABASE_URL`) | Same project, per-surface prefix |
| `..._SUPABASE_ANON_KEY` | ✓ | ✓ | — | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ✓ (server only) | ✓ | Never client-exposed |
| `RESEND_API_KEY` | — | ✓ | ✓ | Email (invites, export) |
| Web base URL | `EXPO_PUBLIC_APP_URL` | `NEXT_PUBLIC_APP_URL` | `WEB_BASE_URL` | **Currently inconsistent — unify naming** |
| ICE base URL | `EXPO_PUBLIC_ICE_BASE_URL` | `NEXT_PUBLIC_ICE_BASE_URL` | — | Used for QR links |
| `SENTRY_DSN` | ✓ | ✓ | ✓ | Add in Phase 3 |

---

## 6. Top risks

- **Medical-data privacy on the public ICE endpoint** (Phase 1, item 5) — this is the one issue that is both a real compliance exposure and easy to miss. Treat as blocking for any public launch.
- **Push infrastructure is a single point of failure for the whole reminder value prop** — if token registration silently fails, the cron functions send nothing and users get no reminders, with no error surfaced. Test on real hardware early (Phase 2).
- **Offline sync edge cases** (conflicts, deletes, multi-device) are the classic source of "my data disappeared" bugs. Keep the v1 sync scope deliberately narrow and well-tested rather than broad and flaky.
- **OneDrive** — keep the working repo in `C:\Dev` (outside OneDrive) permanently; syncing `node_modules`/`.git` was the root cause of the earlier breakage.

---

## 7. Immediate next actions (Phase 0, if you want me to start)

1. Connect `C:\Dev\vitatrack` so I can write to it, then migrate the source there and initialise git.
2. Add the missing `notification.wav`, delete `app.json`, patch the CI `db-check` path, add `.gitignore` + README.
3. Fresh `pnpm install` and confirm type-check + build pass.

Tell me to proceed and I'll execute Phase 0 in the new folder, then we can walk into Phase 1.

---

## 8. Child health record — digitizing the Road to Health Booklet (RtHB)

**The idea.** Every South African child is issued a paper **Road to Health Booklet** — the patient-held record of immunisations, growth, and developmental milestones, used across both public and private care. It gets lost, water-damaged, and left at home exactly when a clinic needs it. A digital RtHB inside VitaTrack is a strong, market-specific hook: it turns the three missing/thin pillars (vaccinations, medical history, and — via growth/vitals — vital signs) into one coherent, emotionally sticky feature for parents, and it slots naturally onto the existing camera-capture, scheduler, and caregiver-sharing infrastructure.

**Why it fits the current architecture.**
- **Camera capture** already exists (`scan_captures`, `extract-reading` Edge Function, on-device + cloud OCR). Photographing the physical RtHB pages to bootstrap the digital record is the same pipeline pointed at a new artifact type.
- **The scheduler** that drives medication reminders is the same machinery needed for **vaccine booster due-dates** — a due-date is just a schedule with a different payload.
- **Caregiver sharing** (`family_members`, `is_family_member`) is close to what's needed, but a child is a *dependant the guardian owns*, not a peer who shares back — so it needs a distinct model (§8.1).

### 8.1 Dependants (managed child profiles)
Adult-to-adult sharing (`family_members`) is the wrong shape for a child: the child has no `auth.users` login, and the guardian needs full read/write, not viewer/dose_logger. Add a lightweight dependant profile the guardian owns:

```sql
CREATE TABLE dependants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guardian_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  sex           TEXT CHECK (sex IN ('male','female')),          -- WHO growth standards are sex-specific
  birth_weight_g   INTEGER,
  gestational_age_wk NUMERIC,                                    -- for preterm growth correction
  relationship  TEXT,                                           -- 'child','grandchild','ward'...
  rthb_number   TEXT,                                           -- printed RtHB / clinic number
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Design decision to make:** do child records hang off a `dependant_id`, or does every dependant get a real `profiles` row (so the child can later "graduate" to owning their own account at 18)? Recommendation: give dependants their own `profiles` row flagged `is_dependant = TRUE` with a nullable `auth.users` link, so vaccinations/vitals/labs can reuse `profile_id` unchanged and account graduation is just linking a login. Revisit RLS: guardian access via a `is_guardian_of(profile)` helper mirroring `is_family_member`.

### 8.2 Immunisations
The EPI-SA schedule was revised — as of the **January 2024** update, the combined **measles-rubella (MR)** vaccine replaced measles-alone, and a **Tdap booster at 6 years** replaced the old Td. A further revision is in circulation for 2025. So the schedule must be **data-driven, not hard-coded** — store the recommended schedule as seed data and version it, so a schedule change is a data migration, not an app release.

```sql
-- Reference: the recommended schedule (seeded, versioned)
CREATE TABLE vaccine_schedule (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_ver  TEXT NOT NULL,             -- 'EPI-SA-2024.1'
  vaccine_code  TEXT NOT NULL,             -- 'BCG','OPV','HexaXIM','PCV','RV','MR','Tdap'...
  vaccine_name  TEXT NOT NULL,
  dose_label    TEXT NOT NULL,             -- 'birth','6 weeks','10 weeks','6 years'...
  offset_days   INTEGER NOT NULL,          -- from date of birth
  UNIQUE (schedule_ver, vaccine_code, dose_label)
);

-- Per-child administered / due doses
CREATE TABLE immunisations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vaccine_code  TEXT NOT NULL,
  vaccine_name  TEXT NOT NULL,
  dose_label    TEXT,                      -- links to schedule dose
  status        TEXT NOT NULL DEFAULT 'due'
                CHECK (status IN ('due','given','skipped','contraindicated')),
  due_date      DATE,
  given_date    DATE,
  batch_lot     TEXT,
  site          TEXT,                      -- 'left thigh','right arm'...
  facility      TEXT,
  administered_by TEXT,
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','scan','import')),
  capture_id    UUID REFERENCES scan_captures(id) ON DELETE SET NULL,
  cert_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,  -- yellow-fever / COVID cert
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_immunisations_profile ON immunisations(profile_id);
```

On adding a child, expand the active `vaccine_schedule` into per-child `immunisations` rows with computed `due_date = DOB + offset_days`; the existing reminder scheduler fires on `due_date`. Add `'immunization'` and `'growth_chart'` to the `documents.category` enum so certificates and scanned RtHB pages can be filed. Extend `scan_captures.artifact` with `'rthb'`.

### 8.3 Growth monitoring
The RtHB's core is the growth curve. Store discrete measurements and compute z-scores / percentiles against the **WHO Child Growth Standards** (a pure, testable util — same pattern as the existing BP classifier and glucose converter in `packages/shared`).

```sql
CREATE TABLE growth_measurements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  measured_at   DATE NOT NULL,
  weight_kg     NUMERIC,
  length_cm     NUMERIC,                   -- length (lying) vs height (standing)
  head_circ_cm  NUMERIC,
  muac_cm       NUMERIC,                   -- mid-upper-arm circumference (malnutrition screen)
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','scan','import')),
  capture_id    UUID REFERENCES scan_captures(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_growth_profile ON growth_measurements(profile_id, measured_at);
```

Add `packages/shared/src/utils/growth.ts`: `weightForAgeZ`, `lengthForAgeZ`, `weightForLengthZ`, `headCircForAgeZ`, taking sex + age-in-days, returning z-score and percentile, with flags for the WHO cut-offs (e.g. underweight < −2 SD, severe < −3 SD). Ship the WHO LMS reference tables as bundled JSON. Chart on the mobile/web dashboard with Recharts, overlaying the standard percentile bands.

### 8.4 Developmental milestones
The RtHB tracks milestones by age band (smiles, sits, walks, first words). Model as a seeded checklist plus per-child status:

```sql
CREATE TABLE milestones (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  domain        TEXT,                      -- 'motor','language','social','cognitive'
  milestone     TEXT NOT NULL,
  expected_age_band TEXT,                  -- '6-9 months'
  status        TEXT NOT NULL DEFAULT 'not_yet'
                CHECK (status IN ('not_yet','achieved','concern')),
  achieved_on   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

A `'concern'` flag (milestone overdue for age band) is a natural, gentle nudge to see a clinician — surfaced, never alarmist.

### 8.5 RtHB digitisation flow (the hook)
1. Guardian adds a child (§8.1).
2. "Scan your Road to Health Booklet" → camera captures the immunisation and growth pages → `extract-reading` returns structured fields → guardian reviews low-confidence fields (existing review UI) → rows written to `immunisations` / `growth_measurements` with `source = 'scan'` and a `capture_id` for provenance.
3. From date of birth + the active schedule, VitaTrack computes what's **due next** and sets reminders.
4. Growth chart renders immediately from the scanned history.

This is the demo that sells the app to a parent: photograph the paper card, and the phone instantly knows the next clinic date and whether the child is growing on track.

### 8.6 Compliance & safety notes
- **Children's data under POPIA** is special-personal information requiring *competent person* (guardian) consent — extend the existing `popia_consent` capture to record guardian consent per dependant, and make the `data-export` (right-of-access) and deletion paths dependant-aware.
- Growth flags and milestone "concern" states are **screening prompts, not diagnoses** — copy must be non-alarmist and always route to a real clinician. Keep any interpretive text in `packages/shared` so it's reviewed and testable.
- The digital record **supplements** the paper RtHB; do not imply it replaces the official document clinics still stamp.

---

## 9. Proposed schema for the other missing pillars

Sketches to accompany §3.4 (details deferred to Phase 5 implementation).

### 9.1 Allergies
```sql
CREATE TABLE allergies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  allergen      TEXT NOT NULL,
  allergen_type TEXT CHECK (allergen_type IN ('drug','food','environmental','other')),
  reaction      TEXT,
  severity      TEXT CHECK (severity IN ('mild','moderate','severe','anaphylaxis')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','resolved')),
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  noted_at      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
Keep the ICE emergency card's `allergies[]` as a **denormalised projection** of the `active` rows, not the source of truth. Add a drug-allergy check when a medication is added.

### 9.2 Conditions / problem list (backbone of "medical history")
```sql
CREATE TABLE conditions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  icd10_code    TEXT,
  category      TEXT CHECK (category IN ('chronic','acute','surgical','family_history','mental_health','other')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved','in_remission')),
  onset_date    DATE,
  resolved_date DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
Let `medications`, `doctor_visits`, and `allergies` optionally reference a `condition_id` so history is linked rather than scattered.

### 9.3 Interoperability note
Labs already carry LOINC. Model these new tables with **FHIR** resource shapes in mind — `AllergyIntolerance`, `Condition`, `Immunization`, `MedicationStatement`, `Observation` (growth) — even if you don't ship a FHIR API in v1. It's near-free at design time and avoids a rewrite if clinician import/export ever matters. Use ICD-10 for conditions (SA private sector already codes in ICD-10 for billing).

### 9.4 Prescriptions (decision, not just a table)
Decide the entity's meaning before building:
- **Option A — keep as-is:** `medications` = the med list; a "prescription" is just a scanned document. Cheapest; fine for a self-tracking app.
- **Option B — clinical record:** add a `prescriptions` table (prescriber name + HPCSA/practice number, Rx date, pharmacy, refills authorised/remaining, ICD-10) and link `medications.prescription_id`. Needed if you ever want refill authorisation tracking or clinician trust.

Recommendation: A for launch, B when pharmacy/refill features are on the roadmap.

### 9.5 Wearables (the epic — scope explicitly)
Not a table, an integration layer: platform SDKs (**Apple HealthKit**, **Android Health Connect**) for on-device reads, plus OAuth to one cloud provider (**Fitbit** or **Garmin**) to start. Requirements that don't exist yet: a `'device_sync'` value in the `vitals.source` enum, a per-source provenance/external-id column for **deduplication** against manual entries, background sync, and a storage decision for high-frequency streams (HR, steps) that the row-per-reading `vitals` shape handles badly — consider a separate `wearable_samples` table or aggregation on ingest. Given the size, **the honest recommendation is to defer wearables past v1.x** rather than half-build it.
