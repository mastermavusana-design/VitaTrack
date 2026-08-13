-- ============================================================
-- VitaTrack — grant table privileges on the Phase 5 child-health
--             tables to the `authenticated` role.
-- ============================================================
-- Bug: the main schema (20240101) ran
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- but that only affects tables that EXIST at that moment. The
-- dependant-scoped tables added later in 20240728_child_health_record
-- (dependants, immunisations, growth_measurements, milestones) never
-- received a grant, so `authenticated` has no table-level privilege on
-- them. Under the R1 client-direct model the app (and the pgTAP RLS
-- tests) access these tables directly as `authenticated`, which fails
-- with: ERROR "permission denied for table dependants".
--
-- Fix: grant the CRUD privileges these tables need. Row access stays
-- fully governed by the existing RLS policies on each table
-- ("… guardian CRUD" / "… family read" / cross-tenant WITH CHECK) —
-- the grant only permits the role to touch the table at all; RLS still
-- decides which rows. UUID PKs (uuid_generate_v4) mean no sequences to
-- grant.
--
-- IDEMPOTENT: GRANT is naturally idempotent; safe to re-run.
--
-- NOTE (tracked separately, NOT fixed here): the camera-capture tables
-- from 20240727 (scan_captures, lab_results, qr_issuer_keys) have the
-- same missing-grant pattern. They are intentionally left out of this
-- migration because qr_issuer_keys holds signing-key material and needs
-- a deliberate, column-aware review of what `authenticated` may read.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON dependants          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON immunisations       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON growth_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON milestones          TO authenticated;
