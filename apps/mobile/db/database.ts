/**
 * WatermelonDB database singleton.
 * Import `database` wherever you need local DB access.
 */
import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { schema } from './schema'
import { VitalModel, MedicationModel, MedicationScheduleModel, DoseLogModel } from './models'

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'VitaTrack',
  // jsi: true — enable for better performance on Hermes (requires Expo bare workflow)
  onSetUpError: (error: Error) => {
    console.error('[WatermelonDB] Setup error:', error)
  },
})

export const database = new Database({
  adapter,
  modelClasses: [
    VitalModel,
    MedicationModel,
    MedicationScheduleModel,
    DoseLogModel,
  ],
})

export const vitalsCollection          = database.get<VitalModel>('vitals')
export const medicationsCollection     = database.get<MedicationModel>('medications')
export const schedulesCollection       = database.get<MedicationScheduleModel>('medication_schedules')
export const doseLogsCollection        = database.get<DoseLogModel>('dose_logs')
