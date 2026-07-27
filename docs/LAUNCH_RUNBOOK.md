# VitaTrack — Phase 4 Launch Runbook

Everything needed to take VitaTrack from a green build to live in production and
submitted to the stores. Steps marked **[credentials]** require accounts/secrets
only you hold — run them yourself; the commands are exact.

Order: **Supabase (backend) → Vercel (web) → EAS (mobile) → store submission.**

---

## 0. Pre-flight

- [ ] `pnpm install && pnpm type-check && pnpm build` all pass locally.
- [ ] `pnpm --filter @vitatrack/shared test` passes.
- [ ] Decide the production web domain. Default is the Vercel domain
      `vitatrack.vercel.app`. If you attach a custom domain, update:
  - `WEB_BASE_URL` in `packages/shared/src/constants/index.ts`
  - all URLs in `docs/STORE_LISTING.md`
  - the `EXPO_PUBLIC_ICE_BASE_URL` / `NEXT_PUBLIC_ICE_BASE_URL` env values
- [ ] Fill the `[bracketed]` legal placeholders in `/privacy` and `/terms`
      (registered company name, registration number, address, Information
      Officer contact) and register the Information Officer with the
      Information Regulator.

---

## 1. Supabase production project **[credentials]**

1. Create the project in the **AWS Africa (Cape Town) `af-south-1`** region
   (POPIA data-residency). Note the project ref, URL, anon key, and service-role key.

2. Link the CLI and push the schema (runs all migrations in `supabase/migrations`):
   ```bash
   supabase link --project-ref <PROD_PROJECT_REF>
   supabase db push
   ```

3. Set function secrets:
   ```bash
   supabase secrets set RESEND_API_KEY=<key> WEB_BASE_URL=https://vitatrack.vercel.app
   ```

4. Deploy the Edge Functions:
   ```bash
   supabase functions deploy dose-materialize
   supabase functions deploy caregiver-alert
   supabase functions deploy refill-daily
   supabase functions deploy send-family-invite
   supabase functions deploy data-export
   supabase functions deploy extract-reading
   ```

5. **Cron schedules** are declared in `supabase/config.toml` and apply on deploy:
   - `dose-materialize` — every 15 min
   - `caregiver-alert` — every 10 min
   - `refill-daily` — daily 07:00 UTC (09:00 SAST)
   Verify in Dashboard → Edge Functions → Schedules.

6. Create the Storage bucket `health-documents` (private) and confirm the RLS
   policies from the migrations are present. Verify the `ice_public` view exists
   and that **anon has no SELECT on the base `ice_profiles` table** (Phase 1 fix).

7. Smoke test: sign up a test user, add a med + a vital, trigger a data export.

---

## 2. Vercel web deployment **[credentials]**

1. Import the Git repo into Vercel. Set **Root Directory = `apps/web`**.
   `apps/web/vercel.json` pins the framework, the `cpt1` (Cape Town) region, and
   the monorepo install/build commands.

2. Set Environment Variables (Production):
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | prod URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | prod service-role key (server only) |
   | `NEXT_PUBLIC_APP_URL` | https://vitatrack.vercel.app |
   | `NEXT_PUBLIC_ICE_BASE_URL` | https://vitatrack.vercel.app/ice |
   | `RESEND_API_KEY` | Resend key |
   | `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | optional |

3. Deploy. Then verify:
   - [ ] `/` loads, `/login` works against prod Supabase
   - [ ] `/privacy` and `/terms` load anonymously (store review needs this)
   - [ ] An ICE link `/ice/<token>` shows only the restricted public subset
   - [ ] Security headers present (CSP, X-Frame-Options) via `next.config.js`

---

## 3. Mobile production build (EAS) **[credentials]**

Config already exists in `apps/mobile/eas.json` and `app.config.js`.

1. Fill placeholders:
   - `extra.eas.projectId` in `app.config.js` (or `EXPO_PUBLIC_EAS_PROJECT_ID`)
   - `submit.production.ios.ascAppId` and `appleTeamId` in `eas.json`
   - Add `google-services-key.json` (Play service account) — **do not commit** it
   - Set the production `env` block URLs/keys in `eas.json` (Supabase prod)

2. Build:
   ```bash
   cd apps/mobile
   eas login
   eas build --profile production --platform all
   ```

3. Verify on a **physical device** (critical — cron alerts are useless without it):
   - [ ] Push-notification token registers to `push_tokens` / `profiles`
   - [ ] A scheduled dose reminder fires
   - [ ] Biometric lock works
   - [ ] Offline capture syncs on reconnect

---

## 4. Store submission **[credentials]**

Use `docs/STORE_LISTING.md` for all copy and the privacy/data-safety answers.

**iOS (App Store Connect):**
1. Create the app record (bundle `app.vitatrack.mobile`), fill listing + App Privacy.
2. `eas submit --profile production --platform ios`
3. Complete the Health questionnaire; submit for review (~1–3 days).

**Android (Google Play Console):**
1. Create the app, complete the Data Safety form and content rating.
2. `eas submit --profile production --platform android` (uploads to the `internal` track).
3. Promote internal → closed/production testing → production.

---

## 5. Post-launch checklist

- [ ] Confirm cron functions are firing (Supabase logs).
- [ ] Confirm emails deliver (Resend dashboard) — SPF/DKIM for the sending domain.
- [ ] Confirm Sentry is receiving events (if DSN configured).
- [ ] Monitor first sign-ups and a real end-to-end caregiver flow.
- [ ] Keep the working repo in `C:\Dev` (outside OneDrive).

---

## Known follow-ups (from the implementation plan)

- Sending domain for email is `vitatrack.app` (edge functions) while the app
  host is the Vercel domain — align the sending domain / SPF records before
  relying on production email.
- Custom domain: attach in Vercel and update the URLs listed in step 0.
