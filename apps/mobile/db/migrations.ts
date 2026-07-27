/**
 * WatermelonDB schema migrations.
 *
 * Every bump of `schema.version` needs a matching `toVersion` step here so
 * existing installs migrate their local SQLite DB instead of being wiped.
 *
 * v1 -> v2: add the `doctor_visits` table (offline sync for visit records).
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
  ],
})
