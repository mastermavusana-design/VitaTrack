-- ============================================================
-- VitaTrack — Phase 1: correctness & security fixes
-- 2 July 2026  |  Run after 20240601_helpers.sql
-- ============================================================
-- Additive migration so it applies cleanly whether or not the
-- earlier migrations have already run against the project.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 5. ICE public exposure fix (highest priority)
--
-- Problem: the main schema grants `SELECT ON ice_profiles TO anon`
-- together with the RLS policy `USING (is_public = TRUE)`. That
-- lets ANY anonymous client read EVERY column of EVERY public ICE
-- row — including profile_id (the owner's auth uid) — and enumerate
-- all public profiles without knowing any qr_token.
--
-- Fix: revoke anon access to the base table, drop the public-read
-- policy, and expose only the QR-appropriate subset through a
-- SECURITY DEFINER function keyed by an exact qr_token. An attacker
-- must know the 128-bit token; no enumeration, no internal columns.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ice: public read" ON ice_profiles;
REVOKE SELECT ON ice_profiles FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_ice_profile(p_token TEXT)
RETURNS TABLE (
  blood_type          TEXT,
  allergies           TEXT[],
  conditions          TEXT[],
  current_medications TEXT[],
  emergency_contacts  JSONB,
  organ_donor         BOOLEAN,
  do_not_resuscitate  BOOLEAN,
  additional_notes    TEXT,
  qr_token            TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    ip.blood_type,
    ip.allergies,
    ip.conditions,
    ip.current_medications,
    ip.emergency_contacts,
    ip.organ_donor,
    ip.do_not_resuscitate,
    ip.additional_notes,
    ip.qr_token
  FROM ice_profiles ip
  WHERE ip.qr_token  = p_token
    AND ip.is_public = TRUE
  LIMIT 1;
$$;

-- Only expose the token-scoped accessor to clients.
REVOKE ALL ON FUNCTION public.get_public_ice_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_ice_profile(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_ice_profile(TEXT) IS
  'Public ICE accessor. Returns only QR-appropriate fields for one exact qr_token where is_public = TRUE. No id/profile_id exposed; no enumeration possible.';

-- ─────────────────────────────────────────────────────────────
-- 6. Reconcile duplicate audit tables
--
-- The main schema defines `audit_logs` (canonical, richer:
-- actor_id / target_profile_id / resource_type / metadata).
-- The helpers migration added a second `audit_log` (singular)
-- used only by the data-export Edge Function. Standardise on
-- `audit_logs` and drop the duplicate. The data-export function
-- is updated in code to read/write `audit_logs`.
--
-- (service_role bypasses RLS, so the Edge Function can still
-- INSERT without an explicit insert policy.)
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS audit_log CASCADE;
