-- ============================================================
-- VitaTrack — post-migration verification checks
-- Run AFTER `supabase db push`. Returns a PASS/FAIL row per fix.
-- Run in: Supabase Dashboard → SQL Editor, or:
--   psql "<session-pooler-connection-string>" -f supabase/verify_migrations.sql
-- ============================================================

WITH checks(sort, check_name, pass) AS (
  VALUES
    (1,  'P1  anon CANNOT read ice_profiles',
         NOT has_table_privilege('anon', 'public.ice_profiles', 'SELECT')),
    (2,  'P1  get_public_ice_profile() exists',
         to_regprocedure('public.get_public_ice_profile(text)') IS NOT NULL),
    (3,  'P1  duplicate audit_log table dropped',
         to_regclass('public.audit_log') IS NULL),
    (4,  'P1  canonical audit_logs table exists',
         to_regclass('public.audit_logs') IS NOT NULL),
    (5,  'P2  health_documents table exists',
         to_regclass('public.health_documents') IS NOT NULL),
    (6,  'P2  health_documents has file_name + file_type',
         (SELECT count(*) = 2 FROM information_schema.columns
            WHERE table_name = 'health_documents'
              AND column_name IN ('file_name','file_type'))),
    (7,  'P2  doctor_visits has provider_name + deleted_at',
         (SELECT count(*) = 2 FROM information_schema.columns
            WHERE table_name = 'doctor_visits'
              AND column_name IN ('provider_name','deleted_at'))),
    (8,  'P2  storage bucket health-documents is private',
         EXISTS (SELECT 1 FROM storage.buckets
                   WHERE id = 'health-documents' AND public IS FALSE)),
    (9,  'P2  storage owner policies present (4)',
         (SELECT count(*) = 4 FROM pg_policies
            WHERE schemaname = 'storage' AND tablename = 'objects'
              AND policyname LIKE 'health-docs%')),
    (10, 'P2  get_pending_invite() exists',
         to_regprocedure('public.get_pending_invite(text)') IS NOT NULL),
    (11, 'P2  accept_family_invite() exists',
         to_regprocedure('public.accept_family_invite(text)') IS NOT NULL),
    (12, 'DM  materialize_pending_doses() exists',
         to_regprocedure('public.materialize_pending_doses(interval,interval,interval,interval)') IS NOT NULL),
    (13, 'DM  get_overdue_doses_for_caregiver() exists',
         to_regprocedure('public.get_overdue_doses_for_caregiver(timestamptz)') IS NOT NULL),
    (14, 'DM  coverage index idx_dose_logs_med_status_sched',
         to_regclass('public.idx_dose_logs_med_status_sched') IS NOT NULL)
)
SELECT check_name,
       CASE WHEN pass THEN 'PASS' ELSE '❌ FAIL' END AS result
FROM checks
ORDER BY sort;

-- Optional: exercise the materializer (idempotent; only creates rows if you
-- have active schedules). Expect JSON like {"reconciled":N,"materialized":N,"expired":N}.
-- SELECT public.materialize_pending_doses();
