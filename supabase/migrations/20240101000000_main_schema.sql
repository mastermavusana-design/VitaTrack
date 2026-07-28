-- ============================================================
-- VitaTrack — Supabase / PostgreSQL Schema
-- MVP v1.0  |  May 2026
-- Region target: AWS af-south-1 (Cape Town)
-- ============================================================
-- Run order: extensions → tables → indexes → RLS policies → functions → triggers
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
-- On Supabase, extensions install into the dedicated `extensions` schema,
-- which is NOT on the migration login role's default search_path. Install
-- them there explicitly and add it to the search_path so uuid_generate_v4()
-- and gen_random_bytes() resolve in column defaults below.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"  WITH SCHEMA extensions;
SET search_path = public, extensions;

-- ─── Utility: updated_at trigger function ────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE: profiles
-- One row per authenticated user (extends auth.users)
-- ============================================================
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  date_of_birth   DATE,
  blood_type      TEXT CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown')),
  phone           TEXT,
  avatar_url      TEXT,
  preferred_units JSONB NOT NULL DEFAULT '{"glucose":"mmol/L","weight":"kg","temperature":"°C"}',
  timezone        TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  popia_consent   BOOLEAN NOT NULL DEFAULT FALSE,
  popia_consent_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: family_members
-- ============================================================
CREATE TABLE family_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  invitee_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('viewer','dose_logger')),
  invite_token    TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  invite_email    TEXT,
  invitee_email   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','revoked')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_family_members_owner       ON family_members(owner_id);
CREATE INDEX idx_family_members_member      ON family_members(member_id);
CREATE INDEX idx_family_members_invitee     ON family_members(invitee_id);
CREATE INDEX idx_family_members_token       ON family_members(invite_token);

-- ============================================================
-- TABLE: medications
-- ============================================================
CREATE TABLE medications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  generic_name    TEXT,
  form            TEXT CHECK (form IN ('tablet','capsule','liquid','injection','patch','inhaler','drops','other')),
  strength        NUMERIC,
  strength_unit   TEXT,
  instructions    TEXT,
  prescriber      TEXT,
  start_date      DATE,
  end_date        DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  pill_count      INTEGER,
  refill_threshold INTEGER,
  color           TEXT,
  reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_medications_profile ON medications(profile_id);

CREATE TRIGGER medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: medication_schedules
-- ============================================================
CREATE TABLE medication_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id   UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  frequency       TEXT NOT NULL
                  CHECK (frequency IN ('daily','twice_daily','three_times_daily','weekly','as_needed','custom')),
  times           TEXT[] NOT NULL DEFAULT '{}',
  days_of_week    INTEGER[],
  cron_expression TEXT,
  dose_amount     NUMERIC,
  dose_unit       TEXT,
  reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_minutes_before INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_med_schedules_med ON medication_schedules(medication_id);

CREATE TRIGGER med_schedules_updated_at
  BEFORE UPDATE ON medication_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: dose_logs
-- ============================================================
CREATE TABLE dose_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id   UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_id     UUID REFERENCES medication_schedules(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL
                  CHECK (status IN ('taken','missed','skipped','pending')),
  dose_amount     NUMERIC,
  dose_unit       TEXT,
  logged_by       UUID REFERENCES profiles(id),
  notes           TEXT,
  caregiver_alerted_at TIMESTAMPTZ DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dose_logs_profile    ON dose_logs(profile_id);
CREATE INDEX idx_dose_logs_medication ON dose_logs(medication_id);
CREATE INDEX idx_dose_logs_scheduled  ON dose_logs(scheduled_at);

-- ============================================================
-- TABLE: vitals
-- ============================================================
CREATE TABLE vitals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL
                  CHECK (type IN ('blood_pressure','glucose','weight','temperature','spo2','heart_rate')),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  systolic        INTEGER,
  diastolic       INTEGER,
  pulse           INTEGER,
  arm             TEXT CHECK (arm IN ('left','right')),
  bp_position     TEXT CHECK (bp_position IN ('sitting','standing','lying')),
  glucose_value   NUMERIC,
  glucose_unit    TEXT CHECK (glucose_unit IN ('mmol/L','mg/dL')),
  meal_context    TEXT CHECK (meal_context IN ('fasting','before_meal','after_meal','bedtime','random')),
  weight_value    NUMERIC,
  weight_unit     TEXT CHECK (weight_unit IN ('kg','lbs')),
  temp_value      NUMERIC,
  temp_unit       TEXT CHECK (temp_unit IN ('°C','°F')),
  temp_site       TEXT CHECK (temp_site IN ('oral','axillary','tympanic','rectal')),
  spo2_value      NUMERIC,
  heart_rate      INTEGER,
  device          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vitals_profile_type ON vitals(profile_id, type);
CREATE INDEX idx_vitals_recorded_at  ON vitals(recorded_at);

-- ============================================================
-- TABLE: doctor_visits
-- ============================================================
CREATE TABLE doctor_visits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  visit_date      DATE NOT NULL,
  doctor_name     TEXT,
  specialty       TEXT,
  facility        TEXT,
  visit_type      TEXT,
  reason          TEXT,
  diagnosis       TEXT,
  treatment       TEXT,
  follow_up_date  DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_visits_profile ON doctor_visits(profile_id);
CREATE INDEX idx_visits_date    ON doctor_visits(visit_date);

CREATE TRIGGER visits_updated_at
  BEFORE UPDATE ON doctor_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: documents
-- ============================================================
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  visit_id        UUID REFERENCES doctor_visits(id) ON DELETE SET NULL,
  category        TEXT NOT NULL
                  CHECK (category IN ('prescription','lab_result','imaging','insurance','hospital','other')),
  title           TEXT NOT NULL,
  storage_path    TEXT NOT NULL UNIQUE,
  mime_type       TEXT NOT NULL,
  file_size_bytes BIGINT,
  original_name   TEXT,
  notes           TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_profile  ON documents(profile_id);
CREATE INDEX idx_documents_visit    ON documents(visit_id);
CREATE INDEX idx_documents_category ON documents(category);

-- ============================================================
-- TABLE: ice_profiles
-- ============================================================
CREATE TABLE ice_profiles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  blood_type          TEXT,
  allergies           TEXT[],
  conditions          TEXT[],
  current_medications TEXT[],
  emergency_contacts  JSONB,
  organ_donor         BOOLEAN,
  do_not_resuscitate  BOOLEAN DEFAULT FALSE,
  additional_notes    TEXT,
  qr_token            TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_public           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ice_qr_token ON ice_profiles(qr_token);

CREATE TRIGGER ice_profiles_updated_at
  BEFORE UPDATE ON ice_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE: push_tokens
-- ============================================================
CREATE TABLE push_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  platform        TEXT CHECK (platform IN ('ios','android','web')),
  device_name     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX idx_push_tokens_profile ON push_tokens(profile_id);

-- ============================================================
-- TABLE: audit_logs
-- ============================================================
CREATE TABLE audit_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,
  resource_type     TEXT,
  resource_id       UUID,
  ip_address        INET,
  user_agent        TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_target_profile ON audit_logs(target_profile_id);
CREATE INDEX idx_audit_created_at     ON audit_logs(created_at);

-- ============================================================
-- PROFILES: add push token columns
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS expo_push_token      TEXT,
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ;

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE dose_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_visits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_family_member(owner UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE owner_id   = owner
      AND invitee_id = auth.uid()
      AND status     = 'accepted'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_dose_logger(owner UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE owner_id   = owner
      AND invitee_id = auth.uid()
      AND role       = 'dose_logger'
      AND status     = 'accepted'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- profiles
CREATE POLICY "profiles: own read"          ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles: own update"        ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles: family read"       ON profiles FOR SELECT USING (is_family_member(id));

-- family_members
CREATE POLICY "family: owner manage"        ON family_members FOR ALL    USING (owner_id    = auth.uid());
CREATE POLICY "family: invitee read"        ON family_members FOR SELECT USING (invitee_id  = auth.uid());
CREATE POLICY "family: invitee accept"      ON family_members FOR UPDATE USING (invitee_id  = auth.uid()) WITH CHECK (status = 'accepted');

-- medications
CREATE POLICY "medications: own CRUD"       ON medications FOR ALL    USING (profile_id = auth.uid());
CREATE POLICY "medications: family read"    ON medications FOR SELECT USING (is_family_member(profile_id));

-- medication_schedules
CREATE POLICY "schedules: own CRUD"         ON medication_schedules FOR ALL    USING (medication_id IN (SELECT id FROM medications WHERE profile_id = auth.uid()));
CREATE POLICY "schedules: family read"      ON medication_schedules FOR SELECT USING (medication_id IN (SELECT id FROM medications WHERE is_family_member(profile_id)));

-- dose_logs
CREATE POLICY "dose_logs: own CRUD"         ON dose_logs FOR ALL    USING (profile_id = auth.uid());
CREATE POLICY "dose_logs: family read"      ON dose_logs FOR SELECT USING (is_family_member(profile_id));
CREATE POLICY "dose_logs: dose_logger ins"  ON dose_logs FOR INSERT WITH CHECK (is_dose_logger(profile_id));

-- vitals
CREATE POLICY "vitals: own CRUD"            ON vitals FOR ALL    USING (profile_id = auth.uid());
CREATE POLICY "vitals: family read"         ON vitals FOR SELECT USING (is_family_member(profile_id));

-- doctor_visits
CREATE POLICY "visits: own CRUD"            ON doctor_visits FOR ALL    USING (profile_id = auth.uid());
CREATE POLICY "visits: family read"         ON doctor_visits FOR SELECT USING (is_family_member(profile_id));

-- documents
CREATE POLICY "documents: own CRUD"         ON documents FOR ALL    USING (profile_id = auth.uid());
CREATE POLICY "documents: family read"      ON documents FOR SELECT USING (is_family_member(profile_id));

-- ice_profiles
CREATE POLICY "ice: own CRUD"               ON ice_profiles FOR ALL    USING (profile_id = auth.uid());
CREATE POLICY "ice: public read"            ON ice_profiles FOR SELECT USING (is_public = TRUE);

-- push_tokens
CREATE POLICY "push_tokens: own CRUD"       ON push_tokens FOR ALL USING (profile_id = auth.uid());

-- audit_logs
CREATE POLICY "audit: own read"             ON audit_logs FOR SELECT USING (target_profile_id = auth.uid());

-- ============================================================
-- GRANTS
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ice_profiles TO anon;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, popia_consent, popia_consent_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    FALSE,
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: Decrement pill_count on dose taken
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_pill_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'taken' THEN
    UPDATE medications
    SET pill_count = GREATEST(0, pill_count - 1)
    WHERE id = NEW.medication_id AND pill_count IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_dose_taken
  AFTER INSERT ON dose_logs
  FOR EACH ROW EXECUTE FUNCTION decrement_pill_count();

-- ============================================================
-- VIEWS
-- ============================================================
CREATE OR REPLACE VIEW medication_adherence_summary AS
SELECT
  dl.profile_id,
  dl.medication_id,
  m.name AS medication_name,
  DATE(dl.scheduled_at AT TIME ZONE 'Africa/Johannesburg') AS log_date,
  COUNT(*) FILTER (WHERE dl.status = 'taken')   AS taken_count,
  COUNT(*) FILTER (WHERE dl.status = 'missed')  AS missed_count,
  COUNT(*) FILTER (WHERE dl.status = 'skipped') AS skipped_count,
  COUNT(*) AS total_scheduled
FROM dose_logs dl
JOIN medications m ON m.id = dl.medication_id
WHERE dl.scheduled_at IS NOT NULL
GROUP BY dl.profile_id, dl.medication_id, m.name, log_date;

CREATE OR REPLACE VIEW refill_alerts AS
SELECT
  m.id          AS medication_id,
  m.profile_id,
  m.name        AS medication_name,
  m.pill_count,
  m.refill_threshold
FROM medications m
WHERE m.is_active = TRUE
  AND m.pill_count IS NOT NULL
  AND m.refill_threshold IS NOT NULL
  AND m.pill_count <= m.refill_threshold;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON COLUMN ice_profiles.qr_token IS 'Used in public URL /ice/{qr_token}. Never expose sensitive fields via this token.';
COMMENT ON TABLE audit_logs IS 'POPIA compliance: retain 12 months minimum.';
