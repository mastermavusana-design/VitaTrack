-- ============================================================
-- VitaTrack — Phase 2: feature completion
-- 3 July 2026  |  Run after 20240702000000_phase1_security_fixes.sql
-- ============================================================
-- Defensive/idempotent: uses IF EXISTS guards so it applies cleanly
-- whatever state the target project is in.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 9a. Documents: reconcile table/column naming with the app.
--
-- The app (mobile useRecords, web records page, data-export) reads
-- and writes table `health_documents` with columns file_name /
-- file_type. The original schema shipped `documents` with title /
-- mime_type, so every document query currently errors. Rename the
-- table and columns to match the code (the app UI is the source of
-- truth here). RLS policies + indexes follow the table on rename.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'documents')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'health_documents') THEN
    ALTER TABLE documents RENAME TO health_documents;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'health_documents' AND column_name = 'title')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'health_documents' AND column_name = 'file_name') THEN
    ALTER TABLE health_documents RENAME COLUMN title TO file_name;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'health_documents' AND column_name = 'mime_type')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'health_documents' AND column_name = 'file_type') THEN
    ALTER TABLE health_documents RENAME COLUMN mime_type TO file_type;
  END IF;
END $$;

-- Safety for fresh installs: ensure the app-required columns exist.
ALTER TABLE health_documents
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_type TEXT;

-- ─────────────────────────────────────────────────────────────
-- 9b. Private storage bucket for health documents + owner-only RLS.
--     Mobile upload path convention: `{auth.uid()}/{ts}_{name}`,
--     so the first path segment must equal the caller's uid.
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('health-documents', 'health-documents', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "health-docs: owner read"   ON storage.objects;
DROP POLICY IF EXISTS "health-docs: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "health-docs: owner update" ON storage.objects;
DROP POLICY IF EXISTS "health-docs: owner delete" ON storage.objects;

CREATE POLICY "health-docs: owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "health-docs: owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "health-docs: owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "health-docs: owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────
-- 10. doctor_visits: rename doctor_name -> provider_name (app
--     convention — visit-add insert and both record UIs use it),
--     and add deleted_at for offline soft-delete propagation.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'doctor_visits' AND column_name = 'doctor_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'doctor_visits' AND column_name = 'provider_name') THEN
    ALTER TABLE doctor_visits RENAME COLUMN doctor_name TO provider_name;
  END IF;
END $$;

ALTER TABLE doctor_visits
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_visits_updated_at ON doctor_visits(updated_at);

-- ─────────────────────────────────────────────────────────────
-- 11. Caregiver invite acceptance.
--
-- Bug: acceptance never set invitee_id, and RLS gave the invitee no
-- way to read/claim a pending invite by token — so is_family_member()
-- and is_dose_logger() (both keyed on invitee_id = auth.uid()) could
-- never return true, and caregivers saw nothing / could not log doses.
--
-- Fix with two SECURITY DEFINER RPCs: one to preview a pending invite
-- (no base-table SELECT needed), one to atomically claim it.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pending_invite(p_token TEXT)
RETURNS TABLE (owner_name TEXT, invite_role TEXT, invite_status TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.full_name, fm.role, fm.status
  FROM family_members fm
  JOIN profiles p ON p.id = fm.owner_id
  WHERE fm.invite_token = p_token
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_pending_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_invite(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_family_invite(p_token TEXT)
RETURNS TABLE (family_member_id UUID, owner_profile_id UUID, new_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row family_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_row FROM family_members WHERE invite_token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF v_row.status = 'revoked' THEN
    RAISE EXCEPTION 'This invite has been revoked';
  END IF;
  IF v_row.owner_id = v_uid THEN
    RAISE EXCEPTION 'You cannot accept your own invite';
  END IF;
  IF v_row.invitee_id IS NOT NULL AND v_row.invitee_id <> v_uid THEN
    RAISE EXCEPTION 'This invite belongs to a different account';
  END IF;

  UPDATE family_members
     SET invitee_id  = v_uid,
         status      = 'accepted',
         accepted_at = COALESCE(accepted_at, NOW())
   WHERE invite_token = p_token
   RETURNING id, owner_id, status
   INTO family_member_id, owner_profile_id, new_status;

  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_family_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_family_invite(TEXT) TO authenticated;
