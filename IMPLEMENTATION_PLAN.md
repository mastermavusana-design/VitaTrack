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
