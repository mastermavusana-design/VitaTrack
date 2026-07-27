/**
 * WatermelonDB schema definition
 * Mirrors the Supabase schema for offline-first local storage.
 * Tables: vitals, medications, medication_schedules, dose_logs, doctor_visits
 *
 * NOTE: when bumping `version`, add a matching step in db/migrations.ts.
 */
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'vitals',
      columns: [
        { name: 'server_id',      type: 'string',  isOptional: true },
        { name: 'profile_id',     type: 'string' },
        { name: 'type',           type: 'string' },
        { name: 'recorded_at',    type: 'number' },  // Unix timestamp ms
        { name: 'systolic',       type: 'number',  isOptional: true },
        { name: 'diastolic',      type: 'number',  isOptional: true },
        { name: 'pulse',          type: 'number',  isOptional: true },
        { name: 'arm',            type: 'string',  isOptional: true },
        { name: 'bp_position',    type: 'string',  isOptional: true },
        { name: 'glucose_value',  type: 'number',  isOptional: true },
        { name: 'glucose_unit',   type: 'string',  isOptional: true },
        { name: 'meal_context',   type: 'string',  isOptional: true },
        { name: 'weight_value',   type: 'number',  isOptional: true },
        { name: 'weight_unit',    type: 'string',  isOptional: true },
        { name: 'temp_value',     type: 'number',  isOptional: true },
        { name: 'temp_unit',      type: 'string',  isOptional: true },
        { name: 'spo2_value',     type: 'number',  isOptional: true },
        { name: 'heart_rate',     type: 'number',  isOptional: true },
        { name: 'device',         type: 'string',  isOptional: true },
        { name: 'notes',          type: 'string',  isOptional: true },
        { name: 'synced_at',      type: 'number',  isOptional: true },
        { name: 'is_deleted',     type: 'boolean', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'medications',
      columns: [
        { name: 'server_id',        type: 'string',  isOptional: true },
        { name: 'profile_id',       type: 'string' },
        { name: 'name',             type: 'string' },
        { name: 'generic_name',     type: 'string',  isOptional: true },
        { name: 'strength',         type: 'number',  isOptional: true },
        { name: 'strength_unit',    type: 'string',  isOptional: true },
        { name: 'form',             type: 'string',  isOptional: true },
        { name: 'color',            type: 'string',  isOptional: true },
        { name: 'prescriber',       type: 'string',  isOptional: true },
        { name: 'instructions',     type: 'string',  isOptional: true },
        { name: 'pill_count',       type: 'number',  isOptional: true },
        { name: 'refill_threshold', type: 'number',  isOptional: true },
        { name: 'is_active',        type: 'boolean' },
        { name: 'reminder_enabled', type: 'boolean' },
        { name: 'synced_at',        type: 'number',  isOptional: true },
        { name: 'is_deleted',       type: 'boolean', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'medication_schedules',
      columns: [
        { name: 'server_id',      type: 'string',  isOptional: true },
        { name: 'medication_id',  type: 'string' },   // WatermelonDB local ID
        { name: 'frequency',      type: 'string' },
        { name: 'times_json',     type: 'string' },   // JSON array of "HH:MM"
        { name: 'days_json',      type: 'string',  isOptional: true }, // JSON int[]
        { name: 'start_date',     type: 'string',  isOptional: true },
        { name: 'is_active',      type: 'boolean' },
        { name: 'synced_at',      type: 'number',  isOptional: true },
      ],
    }),

    tableSchema({
      name: 'dose_logs',
      columns: [
        { name: 'server_id',      type: 'string',  isOptional: true },
        { name: 'medication_id',  type: 'string' },
        { name: 'profile_id',     type: 'string' },
        { name: 'status',         type: 'string' },
        { name: 'scheduled_at',   type: 'number' },
        { name: 'logged_at',      type: 'number' },
        { name: 'notes',          type: 'string',  isOptional: true },
        { name: 'synced_at',      type: 'number',  isOptional: true },
        { name: 'is_dirty',       type: 'boolean', isOptional: true }, // needs push to server
      ],
    }),

    tableSchema({
      name: 'doctor_visits',
      columns: [
        { name: 'server_id',      type: 'string',  isOptional: true },
        { name: 'profile_id',     type: 'string' },
        { name: 'visit_date',     type: 'string' },   // YYYY-MM-DD
        { name: 'visit_type',     type: 'string',  isOptional: true },
        { name: 'provider_name',  type: 'string',  isOptional: true },
        { name: 'specialty',      type: 'string',  isOptional: true },
        { name: 'facility',       type: 'string',  isOptional: true },
        { name: 'reason',         type: 'string',  isOptional: true },
        { name: 'diagnosis',      type: 'string',  isOptional: true },
        { name: 'treatment',      type: 'string',  isOptional: true },
        { name: 'follow_up_date', type: 'string',  isOptional: true },
        { name: 'notes',          type: 'string',  isOptional: true },
        { name: 'server_updated_at', type: 'number', isOptional: true }, // for conflict resolution
        { name: 'synced_at',      type: 'number',  isOptional: true },
        { name: 'is_dirty',       type: 'boolean', isOptional: true }, // needs push to server
        { name: 'is_deleted',     type: 'boolean', isOptional: true }, // soft delete
      ],
    }),
  ],
})
