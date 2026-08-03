-- ─────────────────────────────────────────────────────────────────────────────
-- R5: Give `vitals` an `updated_at` column so edits sync reliably.
--
-- Context: the mobile offline sync (apps/mobile/db/sync.ts) pulled vitals filtered
-- on `created_at`, so any server-side edit (created_at unchanged) never re-pulled.
-- `vitals` also lacked the `updated_at`/trigger pattern every other core table has.
--
-- This migration adds the column, backfills it from created_at, attaches the shared
-- set_updated_at() trigger, and indexes it for the sync `gt('updated_at', since)` query.
--
-- Deploy ordering: apply this migration BEFORE shipping the mobile build that filters
-- vitals on updated_at, or that pull will query a missing column and return nothing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE vitals
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill existing rows so the first sync after deploy doesn't re-pull everything.
UPDATE vitals SET updated_at = created_at WHERE updated_at IS NULL OR updated_at < created_at;

-- Reuse the shared trigger function defined in the main schema.
DROP TRIGGER IF EXISTS vitals_updated_at ON vitals;
CREATE TRIGGER vitals_updated_at
  BEFORE UPDATE ON vitals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_vitals_updated_at ON vitals(updated_at);
