/**
 * WatermelonDB model classes
 * One class per table. Use @field and @json decorators to map columns.
 */
import { Model } from '@nozbe/watermelondb'
import { field, date } from '@nozbe/watermelondb/decorators'

/* ─── Vital ─────────────────────────────────────────────────────────────── */
export class VitalModel extends Model {
  static table = 'vitals'

  @field('server_id')      serverId!:     string | null
  @field('profile_id')     profileId!:    string
  @field('type')           type!:         string
  @date('recorded_at')     recordedAt!:   Date
  @field('systolic')       systolic!:     number | null
  @field('diastolic')      diastolic!:    number | null
  @field('pulse')          pulse!:        number | null
  @field('arm')            arm!:          string | null
  @field('bp_position')    bpPosition!:   string | null
  @field('glucose_value')  glucoseValue!: number | null
  @field('glucose_unit')   glucoseUnit!:  string | null
  @field('meal_context')   mealContext!:  string | null
  @field('weight_value')   weightValue!:  number | null
  @field('weight_unit')    weightUnit!:   string | null
  @field('temp_value')     tempValue!:    number | null
  @field('spo2_value')     spo2Value!:    number | null
  @field('heart_rate')     heartRate!:    number | null
  @field('device')         device!:       string | null
  @field('notes')          notes!:        string | null
  @field('synced_at')      syncedAt!:     number | null
  @field('is_deleted')     isDeleted!:    boolean
}

/* ─── Medication ─────────────────────────────────────────────────────────── */
export class MedicationModel extends Model {
  static table = 'medications'

  @field('server_id')        serverId!:       string | null
  @field('profile_id')       profileId!:      string
  @field('name')             name!:           string
  @field('generic_name')     genericName!:    string | null
  @field('strength')         strength!:       number | null
  @field('strength_unit')    strengthUnit!:   string | null
  @field('form')             form!:           string | null
  @field('color')            color!:          string | null
  @field('prescriber')       prescriber!:     string | null
  @field('instructions')     instructions!:   string | null
  @field('pill_count')       pillCount!:      number | null
  @field('refill_threshold') refillThreshold!:number | null
  @field('is_active')        isActive!:       boolean
  @field('reminder_enabled') reminderEnabled!:boolean
  @field('synced_at')        syncedAt!:       number | null
  @field('is_deleted')       isDeleted!:      boolean
}

/* ─── MedicationSchedule ─────────────────────────────────────────────────── */
export class MedicationScheduleModel extends Model {
  static table = 'medication_schedules'

  @field('server_id')     serverId!:    string | null
  @field('medication_id') medicationId!:string
  @field('frequency')     frequency!:   string
  @field('times_json')    timesJson!:   string   // JSON string — parse with JSON.parse
  @field('days_json')     daysJson!:    string | null
  @field('start_date')    startDate!:   string | null
  @field('is_active')     isActive!:    boolean
  @field('synced_at')     syncedAt!:    number | null

  get times(): string[]  { return this.timesJson ? JSON.parse(this.timesJson) : [] }
  get days():  number[]  { return this.daysJson  ? JSON.parse(this.daysJson)  : [] }
}

/* ─── DoseLog ─────────────────────────────────────────────────────────────── */
export class DoseLogModel extends Model {
  static table = 'dose_logs'

  @field('server_id')    serverId!:   string | null
  @field('medication_id')medicationId!:string
  @field('profile_id')   profileId!:  string
  @field('status')       status!:     string
  @date('scheduled_at')  scheduledAt!:Date
  @date('logged_at')     loggedAt!:   Date
  @field('notes')        notes!:      string | null
  @field('synced_at')    syncedAt!:   number | null
  @field('is_dirty')     isDirty!:    boolean
}

/* ─── Doctor Visit ──────────────────────────────────────────────────────── */
export class DoctorVisitModel extends Model {
  static table = 'doctor_visits'

  @field('server_id')         serverId!:        string | null
  @field('profile_id')        profileId!:       string
  @field('visit_date')        visitDate!:       string
  @field('visit_type')        visitType!:       string | null
  @field('provider_name')     providerName!:    string | null
  @field('specialty')         specialty!:       string | null
  @field('facility')          facility!:        string | null
  @field('reason')            reason!:          string | null
  @field('diagnosis')         diagnosis!:       string | null
  @field('treatment')         treatment!:       string | null
  @field('follow_up_date')    followUpDate!:    string | null
  @field('notes')             notes!:           string | null
  @field('server_updated_at') serverUpdatedAt!: number | null
  @field('synced_at')         syncedAt!:        number | null
  @field('is_dirty')          isDirty!:         boolean
  @field('is_deleted')        isDeleted!:       boolean
}
