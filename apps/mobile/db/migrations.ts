/**
 * WatermelonDB schema migrations.
 *
 * Every bump of `schema.version` needs a matching `toVersion` step here so
 * existing installs migrate their local SQLite DB instead of being wiped.
 *
 * v1 -> v2: add the `doctor_visits` table (offline sync for visit records).
 * v2 -> v3: add the child-health mirror tables (dependants, immunisations,
 *           growth_measurements, milestones) for offline reads (Phase 5).
 */
import { schemaMigrations, createTable } from '@nozbe/watermelondb/Schema/migrations'

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'doctor_visits',
          columns: [
            { name: 'server_id',         type: 'string',  isOptional: true },
            { name: 'profile_id',        type: 'string' },
            { name: 'visit_date',        type: 'string' },
            { name: 'visit_type',        type: 'string',  isOptional: true },
            { name: 'provider_name',     type: 'string',  isOptional: true },
            { name: 'specialty',         type: 'string',  isOptional: true },
            { name: 'facility',          type: 'string',  isOptional: true },
            { name: 'reason',            type: 'string',  isOptional: true },
            { name: 'diagnosis',         type: 'string',  isOptional: true },
            { name: 'treatment',         type: 'string',  isOptional: true },
            { name: 'follow_up_date',    type: 'string',  isOptional: true },
            { name: 'notes',             type: 'string',  isOptional: true },
            { name: 'server_updated_at', type: 'number',  isOptional: true },
            { name: 'synced_at',         type: 'number',  isOptional: true },
            { name: 'is_dirty',          type: 'boolean', isOptional: true },
            { name: 'is_deleted',        type: 'boolean', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'dependants',
          columns: [
            { name: 'server_id',          type: 'string',  isOptional: true },
            { name: 'guardian_id',        type: 'string' },
            { name: 'full_name',          type: 'string' },
            { name: 'date_of_birth',      type: 'string' },
            { name: 'sex',                type: 'string',  isOptional: true },
            { name: 'birth_weight_g',     type: 'number',  isOptional: true },
            { name: 'gestational_age_wk', type: 'number',  isOptional: true },
            { name: 'relationship',       type: 'string',  isOptional: true },
            { name: 'rthb_number',        type: 'string',  isOptional: true },
            { name: 'popia_consent',      type: 'boolean', isOptional: true },
            { name: 'archived_at',        type: 'string',  isOptional: true },
            { name: 'synced_at',          type: 'number',  isOptional: true },
            { name: 'is_deleted',         type: 'boolean', isOptional: true },
          ],
        }),
        createTable({
          name: 'immunisations',
          columns: [
            { name: 'server_id',        type: 'string',  isOptional: true },
            { name: 'dependant_id',     type: 'string' },
            { name: 'vaccine_code',     type: 'string' },
            { name: 'vaccine_name',     type: 'string' },
            { name: 'dose_label',       type: 'string',  isOptional: true },
            { name: 'status',           type: 'string' },
            { name: 'due_date',         type: 'string',  isOptional: true },
            { name: 'given_date',       type: 'string',  isOptional: true },
            { name: 'reminder_enabled', type: 'boolean', isOptional: true },
            { name: 'synced_at',        type: 'number',  isOptional: true },
          ],
        }),
        createTable({
          name: 'growth_measurements',
          columns: [
            { name: 'server_id',    type: 'string',  isOptional: true },
            { name: 'dependant_id', type: 'string' },
            { name: 'measured_at',  type: 'string' },
            { name: 'weight_kg',    type: 'number',  isOptional: true },
            { name: 'length_cm',    type: 'number',  isOptional: true },
            { name: 'head_circ_cm', type: 'number',  isOptional: true },
            { name: 'muac_cm',      type: 'number',  isOptional: true },
            { name: 'synced_at',    type: 'number',  isOptional: true },
          ],
        }),
        createTable({
          name: 'milestones',
          columns: [
            { name: 'server_id',         type: 'string',  isOptional: true },
            { name: 'dependant_id',      type: 'string' },
            { name: 'domain',            type: 'string',  isOptional: true },
            { name: 'milestone',         type: 'string' },
            { name: 'expected_age_band', type: 'string',  isOptional: true },
            { name: 'status',            type: 'string' },
            { name: 'achieved_on',       type: 'string',  isOptional: true },
            { name: 'synced_at',         type: 'number',  isOptional: true },
          ],
        }),
      ],
    },
  ],
})
