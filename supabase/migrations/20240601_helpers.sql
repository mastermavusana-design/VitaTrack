-- ─────────────────────────────────────────────────────────────────────────────
-- VitaTrack helper functions (run after main schema)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure extension functions (gen_random_bytes) resolve on Supabase, where
-- extensions live in the `extensions` schema off the default search_path.
SET search_path = public, extensions;

-- 1. RPC used by caregiver-alert Edge Function
--    Returns overdue pending doses (past cutoff) with caregiver push tokens
CREATE OR REPLACE FUNCTION get_overdue_doses_for_caregiver(cutoff_time TIMESTAMPTZ)
RETURNS TABLE (
  id                UUID,
  medication_id     UUID,
  profile_id        UUID,
  scheduled_at      TIMESTAMPTZ,
  status            TEXT,
  medication_name   TEXT,
  caregiver_token   TEXT,
  caregiver_name    TEXT,
  patient_name      TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dl.id,
    dl.medication_id,
    dl.profile_id,
    dl.scheduled_at,
    dl.status,
    m.name                                  AS medication_name,
    cp.expo_push_token                      AS caregiver_token,
    cp.full_name                            AS caregiver_name,
    pp.full_name                            AS patient_name
  FROM dose_logs dl
  JOIN medications       m   ON m.id  = dl.medication_id
  JOIN profiles          pp  ON pp.id = dl.profile_id
  JOIN family_members    fm  ON fm.owner_id   = dl.profile_id
                            AND fm.status      = 'accepted'
  JOIN profiles          cp  ON cp.id = fm.invitee_id
  WHERE dl.status             = 'pending'
    AND dl.scheduled_at       < cutoff_time
    AND dl.caregiver_alerted_at IS NULL
    AND cp.expo_push_token    IS NOT NULL
  LIMIT 500;
$$;

-- Grant execute to the service role (used by Edge Functions)
GRANT EXECUTE ON FUNCTION get_overdue_doses_for_caregiver(TIMESTAMPTZ) TO service_role;


-- 2. Generate a QR token for ICE profiles that don't have one yet
CREATE OR REPLACE FUNCTION generate_ice_qr_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.qr_token IS NULL THEN
    NEW.qr_token = encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ice_qr_token
  BEFORE INSERT ON ice_profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_ice_qr_token();


-- 3. Auto-insert a pending dose log entry when a medication schedule fires
--    (simplified: actual scheduling is done via the mobile local notifications;
--     this view is used only for caregiver-alert overdue detection)
--    Add caregiver_alerted_at column if not present
ALTER TABLE dose_logs
  ADD COLUMN IF NOT EXISTS caregiver_alerted_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Audit log table (referenced by data-export Edge Function)
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  resource    TEXT,
  ip_address  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: users can only read their own audit logs
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own audit logs"
  ON audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert
CREATE POLICY "Service role insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (true);

-- Index for data-export query
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id, created_at DESC);


-- 5. Add push token columns to profiles if not present
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS expo_push_token      TEXT,
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ;

-- 6. Add invite columns to family_members if not present
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS invite_token   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invitee_email  TEXT,
  ADD COLUMN IF NOT EXISTS invited_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at    TIMESTAMPTZ;

-- Index for invite lookup
CREATE INDEX IF NOT EXISTS idx_family_members_invite_token
  ON family_members(invite_token)
  WHERE invite_token IS NOT NULL;
