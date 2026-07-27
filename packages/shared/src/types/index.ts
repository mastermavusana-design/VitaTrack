// ============================================================
// VitaTrack — Shared TypeScript Types
// Mirrors the Supabase Postgres schema exactly.
// ============================================================

export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown'

export type PreferredUnits = {
  glucose: 'mmol/L' | 'mg/dL'
  weight: 'kg' | 'lbs'
  temperature: '°C' | '°F'
}

// ── Profile ───────────────────────────────────────────────────
export type Profile = {
  id: string
  full_name: string
  date_of_birth: string | null        // ISO date string
  blood_type: BloodType | null
  phone: string | null
  avatar_url: string | null
  preferred_units: PreferredUnits
  timezone: string
  popia_consent: boolean
  popia_consent_at: string | null
  created_at: string
  updated_at: string
}

// ── Family Sharing ───────────────────────────────────────────
export type FamilyMemberRole = 'viewer' | 'dose_logger'
export type FamilyMemberStatus = 'pending' | 'accepted' | 'revoked'

export type FamilyMember = {
  id: string
  owner_id: string
  member_id: string | null
  invitee_id: string | null
  role: FamilyMemberRole
  invite_token: string | null
  invite_email: string | null
  invitee_email: string | null
  status: FamilyMemberStatus
  invited_at: string
  accepted_at: string | null
  revoked_at: string | null
}

// ── Medications ───────────────────────────────────────────────
export type MedicationForm =
  | 'tablet' | 'capsule' | 'liquid' | 'injection'
  | 'patch' | 'inhaler' | 'drops' | 'other'

export type Medication = {
  id: string
  profile_id: string
  name: string
  generic_name: string | null
  form: MedicationForm | null
  strength: number | null
  strength_unit: string | null
  instructions: string | null
  prescriber: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  pill_count: number | null
  refill_threshold: number | null
  color: string | null
  reminder_enabled: boolean
  notes: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

// ── Medication Schedules ──────────────────────────────────────
export type ScheduleFrequency =
  | 'daily' | 'twice_daily' | 'three_times_daily'
  | 'weekly' | 'as_needed' | 'custom'

export type MedicationSchedule = {
  id: string
  medication_id: string
  frequency: ScheduleFrequency
  times: string[]                     // ['08:00', '20:00']
  days_of_week: number[] | null       // 0=Sun..6=Sat
  cron_expression: string | null
  dose_amount: number | null
  dose_unit: string | null
  reminder_enabled: boolean
  reminder_minutes_before: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Dose Logs ─────────────────────────────────────────────────
export type DoseStatus = 'taken' | 'missed' | 'skipped' | 'pending'

export type DoseLog = {
  id: string
  medication_id: string
  profile_id: string
  schedule_id: string | null
  scheduled_at: string | null
  logged_at: string
  status: DoseStatus
  dose_amount: number | null
  dose_unit: string | null
  logged_by: string | null            // profile_id of who logged it
  notes: string | null
  created_at: string
}

// ── Vitals ────────────────────────────────────────────────────
export type VitalType = 'blood_pressure' | 'glucose' | 'weight' | 'temperature' | 'spo2' | 'heart_rate'
export type GlucoseUnit = 'mmol/L' | 'mg/dL'
export type MealContext = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random'
export type WeightUnit = 'kg' | 'lbs'
export type TempUnit = '°C' | '°F'
export type TempSite = 'oral' | 'axillary' | 'tympanic' | 'rectal'
export type BPArm = 'left' | 'right'
export type BPPosition = 'sitting' | 'standing' | 'lying'

export type Vital = {
  id: string
  profile_id: string
  type: VitalType
  recorded_at: string
  // BP
  systolic: number | null
  diastolic: number | null
  pulse: number | null
  arm: BPArm | null
  bp_position: BPPosition | null
  // Glucose
  glucose_value: number | null
  glucose_unit: GlucoseUnit | null
  meal_context: MealContext | null
  // Weight
  weight_value: number | null
  weight_unit: WeightUnit | null
  // Temperature
  temp_value: number | null
  temp_unit: TempUnit | null
  temp_site: TempSite | null
  // SpO2 & HR
  spo2_value: number | null
  heart_rate: number | null
  // Common
  device: string | null
  notes: string | null
  created_at: string
}

// ── Doctor Visits ─────────────────────────────────────────────
export type DoctorVisit = {
  id: string
  profile_id: string
  visit_date: string
  visit_type: string | null
  doctor_name: string | null
  specialty: string | null
  facility: string | null
  reason: string | null
  diagnosis: string | null
  treatment: string | null
  follow_up_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Documents ─────────────────────────────────────────────────
export type DocumentCategory =
  | 'prescription' | 'lab_result' | 'imaging'
  | 'insurance' | 'hospital' | 'other'

export type HealthDocument = {
  id: string
  profile_id: string
  visit_id: string | null
  category: DocumentCategory
  title: string
  storage_path: string
  mime_type: string
  file_size_bytes: number | null
  original_name: string | null
  notes: string | null
  uploaded_at: string
  created_at: string
}

// ── ICE Profile ───────────────────────────────────────────────
export type EmergencyContact = {
  name: string
  relationship: string
  phone: string
  is_primary: boolean
}

export type ICEProfile = {
  id: string
  profile_id: string
  blood_type: BloodType | null
  allergies: string[]
  conditions: string[]
  current_medications: string[]
  emergency_contacts: EmergencyContact[]
  organ_donor: boolean | null
  do_not_resuscitate: boolean
  additional_notes: string | null
  qr_token: string
  is_public: boolean
  created_at: string
  updated_at: string
}

// ── Push Tokens ───────────────────────────────────────────────
export type PushToken = {
  id: string
  profile_id: string
  token: string
  platform: 'ios' | 'android' | 'web'
  device_name: string | null
  is_active: boolean
  registered_at: string
  last_used_at: string | null
}

// ── Audit Logs ────────────────────────────────────────────────
export type AuditLog = {
  id: string
  actor_id: string | null
  target_profile_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ── Derived / View Types ──────────────────────────────────────
export type AdherenceSummary = {
  profile_id: string
  medication_id: string
  medication_name: string
  log_date: string
  taken_count: number
  missed_count: number
  skipped_count: number
  total_scheduled: number
}

export type RefillAlert = {
  medication_id: string
  profile_id: string
  medication_name: string
  pill_count: number
  refill_threshold: number
}

// ── UI helper types ───────────────────────────────────────────
export type MedicationWithSchedules = Medication & {
  schedules: MedicationSchedule[]
}

export type DoseLogWithMedication = DoseLog & {
  medication: Pick<Medication, 'name' | 'form' | 'strength' | 'strength_unit' | 'color'>
}

export type DoctorVisitWithDocuments = DoctorVisit & {
  documents: HealthDocument[]
}

// ── API response wrappers ─────────────────────────────────────
export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: string }
