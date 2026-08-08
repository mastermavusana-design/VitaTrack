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

/* ─── Child Health Record (Phase 5) ─────────────────────────────────────── */
export class DependantModel extends Model {
  static table = 'dependants'

  @field('server_id')          serverId!:         string | null
  @field('guardian_id')        guardianId!:       string
  @field('full_name')          fullName!:         string
  @field('date_of_birth')      dateOfBirth!:      string
  @field('sex')                sex!:              string | null
  @field('birth_weight_g')     birthWeightG!:     number | null
  @field('gestational_age_wk') gestationalAgeWk!: number | null
  @field('relationship')       relationship!:     string | null
  @field('rthb_number')        rthbNumber!:       string | null
  @field('popia_consent')      popiaConsent!:     boolean
  @field('archived_at')        archivedAt!:       string | null
  @field('synced_at')          syncedAt!:         number | null
  @field('is_deleted')         isDeleted!:        boolean
}

export class ImmunisationModel extends Model {
  static table = 'immunisations'

  @field('server_id')        serverId!:        string | null
  @field('dependant_id')     dependantId!:     string
  @field('vaccine_code')     vaccineCode!:     string
  @field('vaccine_name')     vaccineName!:     string
  @field('dose_label')       doseLabel!:       string | null
  @field('status')           status!:          string
  @field('due_date')         dueDate!:         string | null
  @field('given_date')       givenDate!:       string | null
  @field('reminder_enabled') reminderEnabled!: boolean
  @field('synced_at')        syncedAt!:        number | null
}

export class GrowthMeasurementModel extends Model {
  static table = 'growth_measurements'

  @field('server_id')    serverId!:    string | null
  @field('dependant_id') dependantId!: string
  @field('measured_at')  measuredAt!:  string
  @field('weight_kg')    weightKg!:    number | null
  @field('length_cm')    lengthCm!:    number | null
  @field('head_circ_cm') headCircCm!:  number | null
  @field('muac_cm')      muacCm!:      number | null
  @field('synced_at')    syncedAt!:    number | null
}

export class MilestoneModel extends Model {
  static table = 'milestones'

  @field('server_id')         serverId!:        string | null
  @field('dependant_id')      dependantId!:     string
  @field('domain')            domain!:          string | null
  @field('milestone')         milestone!:       string
  @field('expected_age_band') expectedAgeBand!: string | null
  @field('status')            status!:          string
  @field('achieved_on')       achievedOn!:      string | null
  @field('synced_at')         syncedAt!:        number | null
}
