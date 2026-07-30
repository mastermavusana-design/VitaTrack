/**
 * VitaTrack WatermelonDB ↔ Supabase sync adapter
 *
 * Strategy: pull-then-push (manual, not real-time)
 *   Pull: fetch rows updated after `lastSyncedAt` from Supabase → upsert into local DB
 *   Push: find local rows where is_dirty = true → upsert to Supabase → clear is_dirty
 *
 * Call `syncWithSupabase()` on:
 *   - App foreground resume (AppState change)
 *   - After adding/editing a vital or dose log
 *   - Pull-to-refresh in vitals / medications screens
 *
 * Note: Supabase RLS ensures users only see their own data.
 */
import * as SecureStore from 'expo-secure-store'
import { Q } from '@nozbe/watermelondb'
import { database, vitalsCollection, medicationsCollection, doseLogsCollection, doctorVisitsCollection } from './database'
import { getSupabaseClient, captureException } from '@vitatrack/shared'
import type { VitalModel, MedicationModel, DoseLogModel, DoctorVisitModel } from './models'

const SYNC_KEY = 'vitatrack_last_synced_at'
const EPOCH    = '1970-01-01T00:00:00Z'

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
// Persisted to SecureStore so sync survives app restarts (avoids a full
// re-pull on every launch). An in-memory cache avoids a disk read per sync.
let _lastSyncedAt: string | null = null

async function getLastSyncedAt(): Promise<string> {
  if (_lastSyncedAt) return _lastSyncedAt
  try {
    const stored = await SecureStore.getItemAsync(SYNC_KEY)
    if (stored) {
      _lastSyncedAt = stored
      return stored
    }
  } catch (err) {
    console.warn('[Sync] Could not read persisted lastSyncedAt:', err)
  }
  return EPOCH
}

async function setLastSyncedAt(ts: string): Promise<void> {
  _lastSyncedAt = ts
  try {
    await SecureStore.setItemAsync(SYNC_KEY, ts)
  } catch (err) {
    console.warn('[Sync] Could not persist lastSyncedAt:', err)
  }
}

/* ─── Pull: Supabase → Local ──────────────────────────────────────────────── */
async function pullVitals(supabase: ReturnType<typeof getSupabaseClient>, since: string, profileId: string) {
  const { data } = await supabase
    .from('vitals')
    .select('*')
    .eq('profile_id', profileId)
    .gt('created_at', since)
    .order('recorded_at', { ascending: false })
    .limit(500)

  if (!data?.length) return

  await database.write(async () => {
    for (const row of data) {
      const existing = await vitalsCollection
        .query(Q.where('server_id', row.id)).fetch()

      if (existing.length > 0) {
        await existing[0].update((v: VitalModel) => {
          v.systolic      = row.systolic
          v.diastolic     = row.diastolic
          v.pulse         = row.pulse
          v.glucoseValue  = row.glucose_value
          v.glucoseUnit   = row.glucose_unit
          v.mealContext   = row.meal_context
          v.weightValue   = row.weight_value
          v.weightUnit    = row.weight_unit
          v.notes         = row.notes
          v.syncedAt      = Date.now()
        })
      } else {
        await vitalsCollection.create(v => {
          v.serverId      = row.id
          v.profileId     = row.profile_id
          v.type          = row.type
          v.recordedAt    = new Date(row.recorded_at)
          v.systolic      = row.systolic
          v.diastolic     = row.diastolic
          v.pulse         = row.pulse
          v.arm           = row.arm
          v.bpPosition    = row.bp_position
          v.glucoseValue  = row.glucose_value
          v.glucoseUnit   = row.glucose_unit
          v.mealContext   = row.meal_context
          v.weightValue   = row.weight_value
          v.weightUnit    = row.weight_unit
          v.notes         = row.notes
          v.syncedAt      = Date.now()
          v.isDeleted     = false
        })
      }
    }
  })
}

async function pullMedications(supabase: ReturnType<typeof getSupabaseClient>, since: string, profileId: string) {
  const { data } = await supabase
    .from('medications')
    .select('*, schedules:medication_schedules(*)')
    .eq('profile_id', profileId)
    .gt('updated_at', since)

  if (!data?.length) return

  await database.write(async () => {
    for (const row of data) {
      const existing = await medicationsCollection
        .query(Q.where('server_id', row.id)).fetch()

      const writeMed = (m: MedicationModel) => {
        m.serverId        = row.id
        m.profileId       = row.profile_id
        m.name            = row.name
        m.genericName     = row.generic_name
        m.strength        = row.strength
        m.strengthUnit    = row.strength_unit
        m.form            = row.form
        m.color           = row.color
        m.prescriber      = row.prescriber
        m.instructions    = row.instructions
        m.pillCount       = row.pill_count
        m.refillThreshold = row.refill_threshold
        m.isActive        = row.is_active
        m.reminderEnabled = row.reminder_enabled ?? true
        m.syncedAt        = Date.now()
        m.isDeleted       = row.archived_at != null
      }

      if (existing.length > 0) {
        await existing[0].update(writeMed)
      } else {
        await medicationsCollection.create(writeMed)
      }
    }
  })
}

async function pullDoseLogs(supabase: ReturnType<typeof getSupabaseClient>, since: string, profileId: string) {
  const { data } = await supabase
    .from('dose_logs')
    .select('*')
    .eq('profile_id', profileId)
    .gt('logged_at', since)
    .order('logged_at', { ascending: false })
    .limit(500)

  if (!data?.length) return

  await database.write(async () => {
    for (const row of data) {
      const existing = await doseLogsCollection
        .query(Q.where('server_id', row.id)).fetch()

      if (!existing.length) {
        await doseLogsCollection.create(d => {
          d.serverId      = row.id
          d.medicationId  = row.medication_id
          d.profileId     = row.profile_id
          d.status        = row.status
          d.scheduledAt   = new Date(row.scheduled_at)
          d.loggedAt      = new Date(row.logged_at)
          d.notes         = row.notes
          d.syncedAt      = Date.now()
          d.isDirty       = false
        })
      }
    }
  })
}

async function pullDoctorVisits(supabase: ReturnType<typeof getSupabaseClient>, since: string, profileId: string) {
  const { data } = await supabase
    .from('doctor_visits')
    .select('*')
    .eq('profile_id', profileId)
    .gt('updated_at', since)
    .order('visit_date', { ascending: false })
    .limit(500)

  if (!data?.length) return

  await database.write(async () => {
    for (const row of data) {
      const serverUpdatedAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now()

      const writeVisit = (v: DoctorVisitModel) => {
        v.serverId        = row.id
        v.profileId       = row.profile_id
        v.visitDate       = row.visit_date
        v.visitType       = row.visit_type
        v.providerName    = row.provider_name
        v.specialty       = row.specialty
        v.facility        = row.facility
        v.reason          = row.reason
        v.diagnosis       = row.diagnosis
        v.treatment       = row.treatment
        v.followUpDate    = row.follow_up_date
        v.notes           = row.notes
        v.serverUpdatedAt = serverUpdatedAt
        v.syncedAt        = Date.now()
        v.isDirty         = false
        v.isDeleted       = row.deleted_at != null
      }

      const existing = await doctorVisitsCollection
        .query(Q.where('server_id', row.id)).fetch()

      if (existing.length > 0) {
        const local = existing[0]
        // Conflict resolution: skip if the local copy has unpushed edits, or
        // is already at/ahead of this server revision (updated-at wins).
        if (local.isDirty) continue
        if (local.serverUpdatedAt != null && local.serverUpdatedAt >= serverUpdatedAt) continue
        await local.update(writeVisit)
      } else {
        await doctorVisitsCollection.create(writeVisit)
      }
    }
  })
}

/* ─── Push: Local dirty rows → Supabase ──────────────────────────────────── */
async function pushDirtyDoctorVisits(supabase: ReturnType<typeof getSupabaseClient>, profileId: string) {
  const dirty = await doctorVisitsCollection
    .query(Q.where('is_dirty', true), Q.where('profile_id', profileId)).fetch()

  if (!dirty.length) return

  for (const visit of dirty) {
    const { data, error } = await supabase
      .from('doctor_visits')
      .upsert({
        id:             visit.serverId ?? undefined,
        profile_id:     visit.profileId,
        visit_date:     visit.visitDate,
        visit_type:     visit.visitType,
        provider_name:  visit.providerName,
        specialty:      visit.specialty,
        facility:       visit.facility,
        reason:         visit.reason,
        diagnosis:      visit.diagnosis,
        treatment:      visit.treatment,
        follow_up_date: visit.followUpDate,
        notes:          visit.notes,
        // Soft-delete propagation: a locally deleted row sets deleted_at.
        deleted_at:     visit.isDeleted ? new Date().toISOString() : null,
      })
      .select('id, updated_at')
      .single()

    if (!error && data) {
      await database.write(async () => {
        await visit.update((v: DoctorVisitModel) => {
          v.serverId        = data.id
          v.serverUpdatedAt = data.updated_at ? new Date(data.updated_at).getTime() : Date.now()
          v.isDirty         = false
          v.syncedAt        = Date.now()
        })
      })
    }
  }
}

/* ─── Push: Local dirty rows → Supabase ──────────────────────────────────── */
async function pushDirtyDoseLogs(supabase: ReturnType<typeof getSupabaseClient>, profileId: string) {
  const dirty = await doseLogsCollection
    .query(Q.where('is_dirty', true), Q.where('profile_id', profileId)).fetch()

  if (!dirty.length) return

  for (const log of dirty) {
    const { data, error } = await supabase
      .from('dose_logs')
      .upsert({
        id:            log.serverId ?? undefined,
        medication_id: log.medicationId,
        profile_id:    log.profileId,
        status:        log.status,
        scheduled_at:  log.scheduledAt.toISOString(),
        logged_at:     log.loggedAt.toISOString(),
        notes:         log.notes,
      })
      .select('id')
      .single()

    if (!error && data) {
      await database.write(async () => {
        await log.update((l: DoseLogModel) => {
          l.serverId = data.id
          l.isDirty  = false
          l.syncedAt = Date.now()
        })
      })
    }
  }
}

async function pushDirtyVitals(supabase: ReturnType<typeof getSupabaseClient>, profileId: string) {
  const dirty = await vitalsCollection
    .query(Q.where('is_deleted', false), Q.where('profile_id', profileId), Q.where('synced_at', null as any))
    .fetch()

  if (!dirty.length) return

  for (const v of dirty) {
    const { data, error } = await supabase
      .from('vitals')
      .upsert({
        id:            v.serverId ?? undefined,
        profile_id:    v.profileId,
        type:          v.type,
        recorded_at:   v.recordedAt.toISOString(),
        systolic:      v.systolic,
        diastolic:     v.diastolic,
        pulse:         v.pulse,
        arm:           v.arm,
        bp_position:   v.bpPosition,
        glucose_value: v.glucoseValue,
        glucose_unit:  v.glucoseUnit,
        meal_context:  v.mealContext,
        weight_value:  v.weightValue,
        weight_unit:   v.weightUnit,
        notes:         v.notes,
      })
      .select('id')
      .single()

    if (!error && data) {
      await database.write(async () => {
        await v.update((row: VitalModel) => {
          row.serverId = data.id
          row.syncedAt = Date.now()
        })
      })
    }
  }
}

/* ─── Main sync entry point ───────────────────────────────────────────────── */
export async function syncWithSupabase(): Promise<void> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const profileId = user.id
  const since     = await getLastSyncedAt()
  const now       = new Date().toISOString()

  try {
    // Push local changes first so the server has them before we pull
    await pushDirtyDoseLogs(supabase, profileId)
    await pushDirtyVitals(supabase, profileId)
    await pushDirtyDoctorVisits(supabase, profileId)

    // Pull server changes
    await Promise.all([
      pullVitals(supabase, since, profileId),
      pullMedications(supabase, since, profileId),
      pullDoseLogs(supabase, since, profileId),
      pullDoctorVisits(supabase, since, profileId),
    ])

    await setLastSyncedAt(now)
    console.log(`[Sync] Complete. Last synced: ${now}`)
  } catch (err) {
    console.warn('[Sync] Error:', err)
    captureException(err, { tags: { area: 'mobile-sync' } })
    // Fail silently — app continues with local data
  }
}
