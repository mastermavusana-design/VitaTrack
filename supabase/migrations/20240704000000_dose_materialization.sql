-- ============================================================
-- VitaTrack — Dose materialization (closes the missed-dose alert loop)
-- 4 July 2026  |  Run after 20240703000000_phase2_feature_completion.sql
-- ============================================================
-- Problem: caregiver-alert only alerts on dose_logs with status = 'pending',
-- but nothing ever created pending rows — the mobile app only schedules local
-- notifications and logs taken/skipped/missed on user action. So the alert had
-- nothing to fire on.
--
-- This adds a cron-driven job that turns active medication_schedules into
-- 'pending' dose_logs, reconciles them against the patient's actual logging
-- (which inserts separate rows), and expires the truly-missed ones. A matching
-- exclusion is added to the caregiver-alert RPC so it never alerts on a slot
-- the patient already handled.
--
-- Coverage model (no change to the logging UI required):
--   A scheduled slot (medication M, time T) is "covered" if the patient logged
--   any non-pending dose for M whose scheduled_at OR logged_at is within
--   ±p_tolerance of T. Covered slots are never created, are deleted if already
--   created, and are never alerted on.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. materialize_pending_doses(): reconcile → materialize → expire
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.materialize_pending_doses(
  p_lookback   INTERVAL DEFAULT INTERVAL '2 hours',
  p_lookahead  INTERVAL DEFAULT INTERVAL '24 hours',
  p_miss_after INTERVAL DEFAULT INTERVAL '6 hours',
  p_tolerance  INTERVAL DEFAULT INTERVAL '90 minutes'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reconciled  INTEGER := 0;
  v_materialized INTEGER := 0;
  v_expired     INTEGER := 0;
  v_tol_secs    DOUBLE PRECISION := EXTRACT(EPOCH FROM p_tolerance);
BEGIN
  -- (0) Reconcile: drop shadow pending rows the patient has since handled.
  --     The app logs taken/skipped/missed as separate rows, so a covered
  --     pending slot is removed once a matching real action exists.
  DELETE FROM dose_logs p
  WHERE p.status = 'pending'
    AND p.scheduled_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM dose_logs d
      WHERE d.medication_id = p.medication_id
        AND d.id <> p.id
        AND d.status <> 'pending'
        AND (
          ABS(EXTRACT(EPOCH FROM (d.scheduled_at - p.scheduled_at))) <= v_tol_secs
          OR ABS(EXTRACT(EPOCH FROM (d.logged_at  - p.scheduled_at))) <= v_tol_secs
        )
    );
  GET DIAGNOSTICS v_reconciled = ROW_COUNT;

  -- (1) Materialize: create pending rows for active scheduled slots in the
  --     window that aren't already present and aren't already covered.
  WITH sched AS (
    SELECT
      ms.id            AS schedule_id,
      ms.medication_id,
      m.profile_id,
      ms.times,
      ms.days_of_week,
      ms.dose_amount,
      ms.dose_unit,
      COALESCE(p.timezone, 'Africa/Johannesburg') AS tz,
      m.start_date,
      m.end_date
    FROM medication_schedules ms
    JOIN medications m ON m.id = ms.medication_id
    JOIN profiles    p ON p.id = m.profile_id
    WHERE ms.is_active = TRUE
      AND m.is_active  = TRUE
      AND ms.frequency <> 'as_needed'
      AND COALESCE(array_length(ms.times, 1), 0) > 0
  ),
  offsets AS (SELECT generate_series(-1, 1) AS d),
  slots AS (
    SELECT
      s.schedule_id, s.medication_id, s.profile_id, s.dose_amount, s.dose_unit,
      s.start_date, s.end_date, s.days_of_week,
      ((now() AT TIME ZONE s.tz)::date + o.d) AS local_date,
      ((((now() AT TIME ZONE s.tz)::date + o.d)::text || ' ' || t.time_str)::timestamp
        AT TIME ZONE s.tz) AS scheduled_at
    FROM sched s
    CROSS JOIN offsets o
    CROSS JOIN LATERAL unnest(s.times) AS t(time_str)
  ),
  filtered AS (
    SELECT sl.*
    FROM slots sl
    WHERE sl.scheduled_at >= now() - p_lookback
      AND sl.scheduled_at <= now() + p_lookahead
      AND (sl.start_date IS NULL OR sl.local_date >= sl.start_date)
      AND (sl.end_date   IS NULL OR sl.local_date <= sl.end_date)
      -- day-of-week: honour days_of_week when set (0=Sun..6=Sat), else every day
      AND (
        sl.days_of_week IS NULL
        OR array_length(sl.days_of_week, 1) IS NULL
        OR EXTRACT(DOW FROM sl.local_date)::int = ANY (sl.days_of_week)
      )
  ),
  ins AS (
    INSERT INTO dose_logs
      (medication_id, profile_id, schedule_id, scheduled_at, status, dose_amount, dose_unit, logged_at)
    SELECT
      f.medication_id, f.profile_id, f.schedule_id, f.scheduled_at, 'pending',
      f.dose_amount, f.dose_unit, f.scheduled_at
    FROM filtered f
    WHERE NOT EXISTS (               -- not already materialized
      SELECT 1 FROM dose_logs dl
      WHERE dl.schedule_id = f.schedule_id
        AND dl.scheduled_at = f.scheduled_at
    )
      AND NOT EXISTS (               -- not already handled by the patient
      SELECT 1 FROM dose_logs d
      WHERE d.medication_id = f.medication_id
        AND d.status <> 'pending'
        AND (
          ABS(EXTRACT(EPOCH FROM (d.scheduled_at - f.scheduled_at))) <= v_tol_secs
          OR ABS(EXTRACT(EPOCH FROM (d.logged_at  - f.scheduled_at))) <= v_tol_secs
        )
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_materialized FROM ins;

  -- (2) Expire: mark long-overdue, still-pending doses as missed so adherence
  --     stays accurate. Runs well after the 30-min caregiver-alert window.
  UPDATE dose_logs
     SET status = 'missed'
   WHERE status = 'pending'
     AND scheduled_at IS NOT NULL
     AND scheduled_at < now() - p_miss_after;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  RETURN jsonb_build_object(
    'reconciled',   v_reconciled,
    'materialized', v_materialized,
    'expired',      v_expired
  );
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_pending_doses(INTERVAL, INTERVAL, INTERVAL, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_pending_doses(INTERVAL, INTERVAL, INTERVAL, INTERVAL) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. Harden caregiver-alert: never alert on a slot the patient handled.
--    Replaces the version from 20240601_helpers.sql (same signature) with an
--    added exclusion for covered pending slots (±90 min tolerance).
-- ─────────────────────────────────────────────────────────────
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
    -- Skip slots the patient already handled (taken/skipped/missed within 90 min)
    AND NOT EXISTS (
      SELECT 1 FROM dose_logs d2
      WHERE d2.medication_id = dl.medication_id
        AND d2.status <> 'pending'
        AND (
          ABS(EXTRACT(EPOCH FROM (d2.scheduled_at - dl.scheduled_at))) <= 5400
          OR ABS(EXTRACT(EPOCH FROM (d2.logged_at  - dl.scheduled_at))) <= 5400
        )
    )
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION get_overdue_doses_for_caregiver(TIMESTAMPTZ) TO service_role;

-- Helpful index for the coverage lookups above.
CREATE INDEX IF NOT EXISTS idx_dose_logs_med_status_sched
  ON dose_logs (medication_id, status, scheduled_at);
