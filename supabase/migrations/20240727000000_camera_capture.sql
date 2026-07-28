-- ============================================================
-- Camera Capture ("Snap a reading")
-- Adds: scan_captures (provenance/audit), lab_results (flexible
-- analyte storage), and source/capture provenance on vitals & documents.
-- RLS mirrors the existing own-CRUD + family-read pattern.
-- See docs/features/camera-capture-spec.md
-- ============================================================

-- Ensure uuid_generate_v4() resolves on Supabase (extensions schema).
SET search_path = public, extensions;

-- ── scan_captures: one row per scan attempt (audit trail) ───
CREATE TABLE scan_captures (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artifact      TEXT NOT NULL
                CHECK (artifact IN ('device_screen','lab_report','prescription','document','qr')),
  method        TEXT NOT NULL CHECK (method IN ('on_device','cloud','qr')),
  engine        TEXT,                     -- model/provider id + version
  thumb_path    TEXT,                     -- optional low-res thumbnail (private storage); raw image never persisted
  raw_extract   JSONB,                    -- structured ExtractionResult (fields + confidences)
  overall_conf  NUMERIC,                  -- 0..1
  status        TEXT NOT NULL DEFAULT 'reviewed'
                CHECK (status IN ('reviewed','discarded','failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scan_captures_profile ON scan_captures(profile_id);
CREATE INDEX idx_scan_captures_created ON scan_captures(created_at);

-- ── lab_results: analytes that don't fit the fixed vitals set ─
CREATE TABLE lab_results (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_id   UUID REFERENCES health_documents(id) ON DELETE SET NULL,
  capture_id    UUID REFERENCES scan_captures(id) ON DELETE SET NULL,
  panel         TEXT,                     -- e.g. 'HbA1c', 'Lipids', 'U&E'
  analyte       TEXT NOT NULL,            -- e.g. 'LDL cholesterol'
  loinc_code    TEXT,
  value_num     NUMERIC,
  value_text    TEXT,
  unit          TEXT,
  ref_low       NUMERIC,
  ref_high      NUMERIC,
  abnormal_flag TEXT
                CHECK (abnormal_flag IN ('low','high','critical_low','critical_high','normal','abnormal')),
  specimen_at   TIMESTAMPTZ,
  lab_name      TEXT,
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','scan','qr','import')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lab_results_profile ON lab_results(profile_id);
CREATE INDEX idx_lab_results_analyte ON lab_results(analyte);
CREATE INDEX idx_lab_results_document ON lab_results(document_id);

-- ── Provenance on existing tables ───────────────────────────
ALTER TABLE vitals
  ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','scan','qr','import')),
  ADD COLUMN IF NOT EXISTS capture_id UUID REFERENCES scan_captures(id) ON DELETE SET NULL;

ALTER TABLE health_documents
  ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','scan','qr','import')),
  ADD COLUMN IF NOT EXISTS capture_id UUID REFERENCES scan_captures(id) ON DELETE SET NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE scan_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results   ENABLE ROW LEVEL SECURITY;

-- scan_captures
CREATE POLICY "scan_captures: own CRUD"    ON scan_captures FOR ALL
  USING (profile_id = auth.uid());
CREATE POLICY "scan_captures: family read" ON scan_captures FOR SELECT
  USING (is_family_member(profile_id));

-- lab_results
CREATE POLICY "lab_results: own CRUD"      ON lab_results FOR ALL
  USING (profile_id = auth.uid());
CREATE POLICY "lab_results: family read"   ON lab_results FOR SELECT
  USING (is_family_member(profile_id));

-- ── qr_issuer_keys: public directory of trusted QR signers ──
-- Ed25519 PUBLIC keys only (never private material) — safe for any
-- authenticated user to read; the app caches them to verify reading QRs
-- offline. Writes are admin-only (service role bypasses RLS).
CREATE TABLE qr_issuer_keys (
  issuer      TEXT PRIMARY KEY,          -- matches ReadingQRPayload.iss
  public_key  TEXT NOT NULL,             -- base64 32-byte Ed25519 public key
  name        TEXT,                      -- human label (lab/clinic/device maker)
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qr_issuer_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr_issuer_keys: read for authenticated" ON qr_issuer_keys FOR SELECT
  USING (auth.role() = 'authenticated' AND revoked = FALSE);
