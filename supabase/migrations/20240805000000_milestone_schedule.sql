-- ============================================================
-- VitaTrack — Milestone reference schedule (Phase 5, S5)
-- Migration: seeded + versioned developmental-milestone reference,
--            mirroring vaccine_schedule, expanded per-child into the
--            existing `milestones` table.
-- Region target: AWS af-south-1 (Cape Town)
-- ============================================================
-- Run order: table → seed → index → RLS → expand function
--
-- WHY A REFERENCE TABLE (not hard-coded / not a client constant):
--   The `milestones` table (20240728) stores per-child milestone status but has
--   no reference behind it — unlike immunisations, which expand from
--   vaccine_schedule. This migration adds that missing reference so the same
--   "expand on adding a child" pattern works for milestones, and so a revised
--   milestone set is a data migration, not an app release.
--
-- DATA PROVENANCE (seed = 'WHO-GMM-2006'):
--   The seed is the WHO Windows of Achievement for the six gross-motor
--   milestones from the WHO Multicentre Growth Reference Study (WHO Motor
--   Development Study; de Onis et al., Acta Paediatrica Suppl. 450, 2006).
--   The window is the 1st–99th percentile age range. These are authoritative,
--   published values — NOT hand-estimated.
--
--   Deliberately scoped to the motor domain for now. The language, social and
--   cognitive domains should be imported from the CDC "Learn the Signs. Act
--   Early." 2022 checklist as a separate versioned seed (e.g.
--   'CDC-LTSAE-2022') once that source data is transcribed — same discipline
--   as the WHO growth tables (do not hand-type clinical reference data).
--   See PHASE5_BUILD_PLAN.md item S5.
--
-- IDEMPOTENCY: every statement is safe to re-run (IF NOT EXISTS, ON CONFLICT).
-- ============================================================

SET search_path = public, extensions;

-- ============================================================
-- TABLE: milestone_schedule  (reference: recommended milestones, seeded + versioned)
-- ============================================================
CREATE TABLE IF NOT EXISTS milestone_schedule (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_ver      TEXT NOT NULL,             -- 'WHO-GMM-2006'
  domain            TEXT NOT NULL              -- 'motor','language','social','cognitive'
                    CHECK (domain IN ('motor','language','social','cognitive')),
  milestone         TEXT NOT NULL,             -- 'Sits without support'
  expected_age_band TEXT NOT NULL,             -- human label, e.g. '4-9 months'
  offset_days_min   INTEGER NOT NULL,          -- window start, days from date of birth
  offset_days_max   INTEGER NOT NULL,          -- window end (flag if not achieved by here)
  sort_order        INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  UNIQUE (schedule_ver, domain, milestone)
);

CREATE INDEX IF NOT EXISTS idx_milestone_schedule_ver
  ON milestone_schedule(schedule_ver, offset_days_min);

-- ── Seed: WHO-GMM-2006 gross-motor windows (1st–99th percentile).
--    offset_days = round(months * 30.4375).
INSERT INTO milestone_schedule
  (schedule_ver, domain, milestone, expected_age_band, offset_days_min, offset_days_max, sort_order, notes) VALUES
  ('WHO-GMM-2006','motor','Sits without support',      '3.8-9.2 months',  116, 280, 10, NULL),
  ('WHO-GMM-2006','motor','Stands with assistance',    '4.8-11.4 months', 146, 347, 20, NULL),
  ('WHO-GMM-2006','motor','Hands-and-knees crawling',  '5.2-13.5 months', 158, 411, 30,
     'Not universal — a minority of typically-developing children never crawl on hands and knees.'),
  ('WHO-GMM-2006','motor','Walks with assistance',     '5.9-13.7 months', 180, 417, 40, NULL),
  ('WHO-GMM-2006','motor','Stands alone',              '6.9-16.9 months', 210, 514, 50, NULL),
  ('WHO-GMM-2006','motor','Walks alone',               '8.2-17.6 months', 250, 536, 60, NULL)
ON CONFLICT (schedule_ver, domain, milestone) DO NOTHING;

-- ============================================================
-- ROW-LEVEL SECURITY
-- milestone_schedule is reference data: readable by any authenticated user.
-- (The per-child `milestones` table already has guardian/family policies.)
-- ============================================================
ALTER TABLE milestone_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "milestone_schedule: read for authenticated" ON milestone_schedule;
CREATE POLICY "milestone_schedule: read for authenticated" ON milestone_schedule FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- FUNCTION: expand active milestone schedule into per-child rows
-- Call on adding a child (alongside expand_immunisation_schedule):
--   SELECT expand_milestone_schedule(<dependant_id>, 'WHO-GMM-2006');
-- Inserts milestones rows with status 'not_yet'. Idempotent per
-- (dependant, milestone). Guardian-scoped writes still governed by RLS on
-- `milestones`; this function is SECURITY DEFINER so the seed read succeeds.
-- ============================================================
CREATE OR REPLACE FUNCTION expand_milestone_schedule(dep UUID, ver TEXT)
RETURNS INTEGER AS $$
DECLARE
  inserted INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dependants WHERE id = dep) THEN
    RAISE EXCEPTION 'dependant % not found', dep;
  END IF;

  INSERT INTO milestones (dependant_id, domain, milestone, expected_age_band, status)
  SELECT dep, ms.domain, ms.milestone, ms.expected_age_band, 'not_yet'
  FROM milestone_schedule ms
  WHERE ms.schedule_ver = ver
    AND NOT EXISTS (
      SELECT 1 FROM milestones m
      WHERE m.dependant_id = dep
        AND m.milestone = ms.milestone
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
