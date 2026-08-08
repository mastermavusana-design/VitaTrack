-- ============================================================
-- VitaTrack — link health_documents to a child (Phase 5, W5)
-- Migration: add dependants ← health_documents FK so scanned Road to
--            Health pages, growth charts and immunisation certificates
--            can be filed against a specific child.
-- Region target: AWS af-south-1 (Cape Town)
-- ============================================================
-- The category values 'immunization' / 'growth_chart' and the scan artifact
-- 'rthb' were already added in 20240728. This adds only the child link.
--
-- RLS: no new policy needed. A guardian files a document under their OWN
--   profile_id (health_documents "documents: own CRUD" = profile_id = auth.uid())
--   and sets dependant_id to their child; the existing "documents: family read"
--   (is_family_member(profile_id)) still lets accepted caregivers read it. The
--   dependant_id is an organisational link, not a new access path.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================

SET search_path = public, extensions;

ALTER TABLE health_documents
  ADD COLUMN IF NOT EXISTS dependant_id UUID REFERENCES dependants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_health_documents_dependant
  ON health_documents(dependant_id) WHERE dependant_id IS NOT NULL;
