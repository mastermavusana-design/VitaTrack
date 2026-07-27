# VitaTrack — Real Backend & Device Verification Runbook

_Covers the Phase 1, Phase 2, and dose-materialization changes. Run on your machine — the build sandbox is network-isolated and can't reach your Supabase project or a device._

Everything below was verified statically (real PostgreSQL grammar parse via `pglast`, cross-file name checks). This runbook is the live confirmation.

---

## 0. Prerequisites

```bash
# From the repo root: C:\Dev\vitatrack
supabase --version            # need the Supabase CLI installed & logged in
supabase login                # if not already
supabase link --project-ref ddivaffrhanhvfneccdd
```

The three new migrations to be applied (already in `supabase/migrations/`):

- `20240702000000_phase1_security_fixes.sql` — ICE public RPC + audit table reconcile
- `20240703000000_phase2_feature_completion.sql` — documents rename + storage bucket, `provider_name`, caregiver RPCs
- `20240704000000_dose_materialization.sql` — `materialize_pending_doses()` + hardened alert RPC

---

## 1. Apply DB migrations

```bash
supabase db push
```

Then deploy the changed/new Edge Functions (caregiver-alert code is unchanged, but its RPC changed via migration — no redeploy needed):

```bash
supabase functions deploy dose-materialize --no-verify-jwt   # NEW
supabase functions deploy data-export       --no-verify-jwt   # audit_logs table fix
supabase functions deploy send-family-invite --no-verify-jwt  # removed broken email lookup
```

Confirm the new cron is registered (from `supabase/config.toml`): `dose-materialize` every 15 min, `caregiver-alert` every 10 min.

Required function secrets (set once if not already):

```bash
supabase secrets set WEB_BASE_URL=https://app.vitatrack.co.za
supabase secrets set RESEND_API_KEY=re_...        # for invite + data-export email
```

---

## 2. Post-apply verification SQL

Paste into the Supabase SQL editor (or `psql`). Each block asserts one fix.

```sql
-- Phase 1 · ICE: anon must NOT be able to read the base table, and the RPC
-- returns only the safe subset (no id / profile_id / is_public columns).
SELECT has_table_privilege('anon', 'public.ice_profiles', 'SELECT') AS anon_can_read_ice; -- expect FALSE
SELECT proname FROM pg_proc WHERE proname = 'get_public_ice_profile';                      -- expect 1 row

-- Phase 1 · audit tables reconciled: singular table gone, canonical remains.
SELECT to_regclass('public.audit_log')  AS should_be_null;   -- expect NULL
SELECT to_regclass('public.audit_logs') AS should_exist;     -- expect audit_logs

-- Phase 2 · documents reconciled: table + columns match the app.
SELECT to_regclass('public.health_documents') AS should_exist;                  -- expect health_documents
SELECT column_name FROM information_schema.columns
 WHERE table_name='health_documents' AND column_name IN ('file_name','file_type'); -- expect 2 rows
SELECT column_name FROM information_schema.columns
 WHERE table_name='doctor_visits' AND column_name IN ('provider_name','deleted_at'); -- expect 2 rows

-- Phase 2 · storage bucket + owner policies exist.
SELECT id, public FROM storage.buckets WHERE id='health-documents';             -- expect public = false
SELECT policyname FROM pg_policies WHERE tablename='objects' AND policyname LIKE 'health-docs%'; -- expect 4

-- Phase 2 · caregiver RPCs exist.
SELECT proname FROM pg_proc WHERE proname IN ('get_pending_invite','accept_family_invite'); -- expect 2

-- Materialization · functions present and callable (dry run creates real rows
-- only if you have active schedules — safe to run, it's idempotent).
SELECT public.materialize_pending_doses();   -- expect {"reconciled":N,"materialized":N,"expired":N}
```

**Caregiver accept — functional check (run as the invited user's session, e.g. from the web app after clicking the invite link):** after `accept_family_invite`, confirm the row was claimed:

```sql
SELECT invitee_id IS NOT NULL AS claimed, status
FROM family_members WHERE invite_token = '<token>';   -- expect claimed = true, status = accepted
```

---

## 3. App-level end-to-end tests (needs a device / emulator)

Use an **EAS dev build**, not Expo Go — push tokens don't work in Expo Go.

- [ ] **Push token registration (Phase 2, item 12).** Sign in on the dev build, then:
      `SELECT expo_push_token FROM profiles WHERE id = '<your-uid>';` — expect a non-null `ExponentPushToken[...]`.
- [ ] **Document upload (Phase 2, item 9).** Add a visit → attach a document → confirm it appears, and the signed URL opens. Check the row: `SELECT file_name, file_type, storage_path FROM health_documents ORDER BY created_at DESC LIMIT 1;`
- [ ] **WatermelonDB v1→v2 migration (Phase 2, item 10).** Install the PREVIOUS build first (schema v1), then upgrade to this build and launch. It must open without a "migration/schema" crash and existing local vitals/meds must still be there. (Fresh installs are unaffected.)
- [ ] **Caregiver missed-dose alert (Phase 2, item 11 + materialization).** Full loop:
      1. Owner adds a medication with a schedule a few minutes in the past/near-now.
      2. Wait for `dose-materialize` (≤15 min) — confirm a `pending` row: `SELECT status, scheduled_at FROM dose_logs WHERE status='pending' ORDER BY scheduled_at DESC LIMIT 5;`
      3. Owner invites a caregiver (Dose Logger), caregiver accepts, caregiver has a registered push token.
      4. Leave the dose unlogged for 30+ min → caregiver receives a push. Confirm the alert marked it: `SELECT caregiver_alerted_at FROM dose_logs WHERE id='<id>';`
      5. Negative check: log the dose as taken, then confirm the next `materialize_pending_doses()` run reconciles away the pending row (no false alert).

---

## 4. Notes / rollback

- Migrations are additive and idempotent (guarded renames, `IF EXISTS`), so re-running `db push` is safe.
- If a migration half-applies, `supabase db push` is resumable; check `supabase migration list`.
- The `.env.local` service-role key is committed locally only (git-ignored) — rotate it in the dashboard if it was ever shared.
- No dose-logging UI was changed; the materialization job reconciles pending rows by time tolerance, so patient logging keeps working as-is.
