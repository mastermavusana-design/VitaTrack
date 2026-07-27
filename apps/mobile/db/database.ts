/**
 * WatermelonDB database singleton.
 * Import `database` wherever you need local DB access.
 */
import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { schema } from './schema'
import { migrations } from './migrations'
import {
  VitalModel,
  MedicationModel,
  MedicationScheduleModel,
  DoseLogModel,
  DoctorVisitModel,
} from './models'

const adapter = new SQLiteAdapter({
  schema,
  migrations,
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
    DoctorVisitModel,
  ],
})

export const vitalsCollection          = database.get<VitalModel>('vitals')
export const medicationsCollection     = database.get<MedicationModel>('medications')
export const schedulesCollection       = database.get<MedicationScheduleModel>('medication_schedules')
export const doseLogsCollection        = database.get<DoseLogModel>('dose_logs')
export const doctorVisitsCollection    = database.get<DoctorVisitModel>('doctor_visits')
