-- ============================================================
-- VitaTrack — Child Health Record (Road to Health Booklet)
-- Migration: Phase 5 foundation — dependants, immunisations,
--            growth monitoring, developmental milestones.
-- Region target: AWS af-south-1 (Cape Town)
-- ============================================================
-- Run order: tables → seed → indexes → enum extensions → RLS → triggers
--
-- DESIGN DECISION (foundation pass):
--   §8.1 of IMPLEMENTATION_PLAN.md flagged a choice: do child records
--   hang off a `dependant_id`, or does every child get its own `profiles`
--   row (which would require decoupling profiles.id from auth.users)?
--   For this foundation migration we take the DEPENDANT-CENTRIC route:
--   the child health tables key off `dependant_id`, NOT `profile_id`.
--   Rationale: it leaves the existing profiles↔auth.users FK untouched
--   (lower risk, fully reversible) while still delivering the full record.
--   "Graduation" at 18 (child gets a real login) becomes a later, additive
--   migration that provisions a profiles row and backfills a link column —
--   it does not require reshaping these tables.
-- ============================================================

SET search_path = public, extensions;

-- ============================================================
-- TABLE: dependants  (managed child profiles owned by a guardian)
-- ============================================================
CREATE TABLE dependants (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guardian_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name          TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  sex                TEXT CHECK (sex IN ('male','female')),   -- WHO growth standards are sex-specific
  birth_weight_g     INTEGER,
  gestational_age_wk NUMERIC,                                 -- for preterm growth correction
  relationship       TEXT,                                    -- 'child','grandchild','ward'...
  rthb_number        TEXT,                                    -- printed RtHB / clinic number
  schedule_ver       TEXT,                                    -- immunisation schedule version applied to this child
  popia_consent      BOOLEAN NOT NULL DEFAULT FALSE,          -- guardian consent for this child's special-personal data
  popia_consent_at   TIMESTAMPTZ,
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dependants_guardian ON dependants(guardian_id);

CREATE TRIGGER dependants_updated_at
  BEFORE UPDATE ON dependants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: vaccine_schedule  (reference: recommended schedule, seeded + versioned)
-- Data-driven so a schedule change is a data migration, not an app release.
-- ============================================================
CREATE TABLE vaccine_schedule (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_ver  TEXT NOT NULL,             -- 'EPI-SA-2024.1'
  vaccine_code  TEXT NOT NULL,             -- 'BCG','OPV','HEXA','PCV','RV','MR','Tdap'...
  vaccine_name  TEXT NOT NULL,
  dose_label    TEXT NOT NULL,             -- 'birth','6 weeks','10 weeks','6 years'...
  offset_days   INTEGER NOT NULL,          -- from date of birth
  sort_order    INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  UNIQUE (schedule_ver, vaccine_code, dose_label)
);

CREATE INDEX idx_vaccine_schedule_ver ON vaccine_schedule(schedule_ver, offset_days);

-- ── Seed: EPI-SA 2024.1 (Jan-2024 revision — MR replaced measles-alone,
--    Tdap at 6y replaced Td). Offsets are days from date of birth.
INSERT INTO vaccine_schedule (schedule_ver, vaccine_code, vaccine_name, dose_label, offset_days, sort_order) VALUES
  ('EPI-SA-2024.1','BCG',  'Bacillus Calmette-Guérin (TB)',                       'birth',     0,   10),
  ('EPI-SA-2024.1','OPV',  'Oral Polio Vaccine',                                  'birth',     0,   20),
  ('EPI-SA-2024.1','OPV',  'Oral Polio Vaccine',                                  '6 weeks',   42,  30),
  ('EPI-SA-2024.1','RV',   'Rotavirus Vaccine',                                   '6 weeks',   42,  40),
  ('EPI-SA-2024.1','HEXA', 'DTaP-IPV-Hib-HepB (hexavalent)',                      '6 weeks',   42,  50),
  ('EPI-SA-2024.1','PCV',  'Pneumococcal Conjugate Vaccine',                      '6 weeks',   42,  60),
  ('EPI-SA-2024.1','HEXA', 'DTaP-IPV-Hib-HepB (hexavalent)',                      '10 weeks',  70,  70),
  ('EPI-SA-2024.1','RV',   'Rotavirus Vaccine',                                   '14 weeks',  98,  80),
  ('EPI-SA-2024.1','HEXA', 'DTaP-IPV-Hib-HepB (hexavalent)',                      '14 weeks',  98,  90),
  ('EPI-SA-2024.1','PCV',  'Pneumococcal Conjugate Vaccine',                      '14 weeks',  98,  100),
  ('EPI-SA-2024.1','MR',   'Measles-Rubella Vaccine',                             '6 months',  182, 110),
  ('EPI-SA-2024.1','PCV',  'Pneumococcal Conjugate Vaccine',                      '9 months',  274, 120),
  ('EPI-SA-2024.1','MR',   'Measles-Rubella Vaccine',                             '12 months', 365, 130),
  ('EPI-SA-2024.1','HEXA', 'DTaP-IPV-Hib-HepB (hexavalent) booster',              '18 months', 548, 140),
  ('EPI-SA-2024.1','Tdap', 'Tetanus-diphtheria-acellular pertussis booster',      '6 years',   2190,150),
  ('EPI-SA-2024.1','HPV',  'Human Papillomavirus Vaccine (girls) — dose 1',       '9 years',   3285,160),
  ('EPI-SA-2024.1','HPV',  'Human Papillomavirus Vaccine (girls) — dose 2',       '9 years',   3465,170),
  ('EPI-SA-2024.1','Td',   'Tetanus-diphtheria booster',                          '12 years',  4380,180);

-- ============================================================
-- TABLE: immunisations  (per-child administered / due doses)
-- ============================================================
CREATE TABLE immunisations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dependant_id    UUID NOT NULL REFERENCES dependants(id) ON DELETE CASCADE,
  vaccine_code    TEXT NOT NULL,
  vaccine_name    TEXT NOT NULL,
  dose_label      TEXT,                      -- links to schedule dose
  status          TEXT NOT NULL DEFAULT 'due'
                  CHECK (status IN ('due','given','skipped','contraindicated')),
  due_date        DATE,
  given_date      DATE,
  batch_lot       TEXT,
  site            TEXT,                      -- 'left thigh','right arm'...
  facility        TEXT,
  administered_by TEXT,
  reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','scan','import')),
  capture_id      UUID REFERENCES scan_captures(id) ON DELETE SET NULL,
  cert_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,  -- yellow-fever / COVID cert
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_immunisations_dependant ON immunisations(dependant_id);
CREATE INDEX idx_immunisations_due       ON immunisations(due_date) WHERE status = 'due';

CREATE TRIGGER immunisations_updated_at
  BEFORE UPDATE ON immunisations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: growth_measurements  (WHO Child Growth Standards inputs)
-- ============================================================
CREATE TABLE growth_measurements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dependant_id  UUID NOT NULL REFERENCES dependants(id) ON DELETE CASCADE,
  measured_at   DATE NOT NULL,
  weight_kg     NUMERIC,
  length_cm     NUMERIC,                   -- length (lying) vs height (standing)
  head_circ_cm  NUMERIC,
  muac_cm       NUMERIC,                   -- mid-upper-arm circumference (malnutrition screen)
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','scan','import')),
  capture_id    UUID REFERENCES scan_captures(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_growth_dependant ON growth_measurements(dependant_id, measured_at);

-- ============================================================
-- TABLE: milestones  (developmental checklist, per-child status)
-- ============================================================
CREATE TABLE milestones (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dependant_id      UUID NOT NULL REFERENCES dependants(id) ON DELETE CASCADE,
  domain            TEXT,                      -- 'motor','language','social','cognitive'
  milestone         TEXT NOT NULL,
  expected_age_band TEXT,                      -- '6-9 months'
  status            TEXT NOT NULL DEFAULT 'not_yet'
                    CHECK (status IN ('not_yet','achieved','concern')),
  achieved_on       DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_milestones_dependant ON milestones(dependant_id);

-- ============================================================
-- ENUM EXTENSIONS (CHECK constraints on existing tables)
-- documents.category  += 'immunization','growth_chart'
-- scan_captures.artifact += 'rthb'
-- ============================================================
ALTER TABLE documents      DROP CONSTRAINT IF EXISTS documents_category_check;
ALTER TABLE documents      ADD  CONSTRAINT documents_category_check
  CHECK (category IN ('prescription','lab_result','imaging','insurance','hospital','immunization','growth_chart','other'));

ALTER TABLE scan_captures  DROP CONSTRAINT IF EXISTS scan_captures_artifact_check;
ALTER TABLE scan_captures  ADD  CONSTRAINT scan_captures_artifact_check
  CHECK (artifact IN ('device_screen','lab_report','prescription','document','qr','rthb'));

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
ALTER TABLE dependants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccine_schedule    ENABLE ROW LEVEL SECURITY;
ALTER TABLE immunisations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones          ENABLE ROW LEVEL SECURITY;

-- Helper: can the current user see a given dependant?
-- Guardian has full access; the guardian's accepted family members get read.
CREATE OR REPLACE FUNCTION dependant_visible(dep UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM dependants d
    WHERE d.id = dep
      AND (d.guardian_id = auth.uid() OR is_family_member(d.guardian_id))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION dependant_owned(dep UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM dependants d
    WHERE d.id = dep AND d.guardian_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- dependants: guardian full CRUD, family read
CREATE POLICY "dependants: guardian CRUD" ON dependants FOR ALL
  USING (guardian_id = auth.uid()) WITH CHECK (guardian_id = auth.uid());
CREATE POLICY "dependants: family read"   ON dependants FOR SELECT
  USING (is_family_member(guardian_id));

-- vaccine_schedule: readable by any authenticated user (reference data)
CREATE POLICY "vaccine_schedule: read for authenticated" ON vaccine_schedule FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- immunisations
CREATE POLICY "immunisations: guardian CRUD" ON immunisations FOR ALL
  USING (dependant_owned(dependant_id)) WITH CHECK (dependant_owned(dependant_id));
CREATE POLICY "immunisations: family read"   ON immunisations FOR SELECT
  USING (dependant_visible(dependant_id));

-- growth_measurements
CREATE POLICY "growth: guardian CRUD" ON growth_measurements FOR ALL
  USING (dependant_owned(dependant_id)) WITH CHECK (dependant_owned(dependant_id));
CREATE POLICY "growth: family read"   ON growth_measurements FOR SELECT
  USING (dependant_visible(dependant_id));

-- milestones
CREATE POLICY "milestones: guardian CRUD" ON milestones FOR ALL
  USING (dependant_owned(dependant_id)) WITH CHECK (dependant_owned(dependant_id));
CREATE POLICY "milestones: family read"   ON milestones FOR SELECT
  USING (dependant_visible(dependant_id));

-- ============================================================
-- FUNCTION: expand active schedule into per-child immunisation rows
-- Call on adding a child: SELECT expand_immunisation_schedule(<dependant_id>, 'EPI-SA-2024.1');
-- Computes due_date = DOB + offset_days; the existing reminder scheduler
-- fires on due_date. Idempotent per (dependant, vaccine_code, dose_label).
-- ============================================================
CREATE OR REPLACE FUNCTION expand_immunisation_schedule(dep UUID, ver TEXT)
RETURNS INTEGER AS $$
DECLARE
  dob      DATE;
  inserted INTEGER;
BEGIN
  SELECT date_of_birth INTO dob FROM dependants WHERE id = dep;
  IF dob IS NULL THEN
    RAISE EXCEPTION 'dependant % not found or has no date_of_birth', dep;
  END IF;

  INSERT INTO immunisations (dependant_id, vaccine_code, vaccine_name, dose_label, status, due_date, source)
  SELECT dep, vs.vaccine_code, vs.vaccine_name, vs.dose_label, 'due', dob + vs.offset_days, 'manual'
  FROM vaccine_schedule vs
  WHERE vs.schedule_ver = ver
    AND NOT EXISTS (
      SELECT 1 FROM immunisations i
      WHERE i.dependant_id = dep
        AND i.vaccine_code = vs.vaccine_code
        AND i.dose_label   = vs.dose_label
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;

  UPDATE dependants SET schedule_ver = ver WHERE id = dep AND schedule_ver IS NULL;

  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
