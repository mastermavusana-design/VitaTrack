export * from './medications'

export const APP_NAME = 'VitaTrack'
export const APP_VERSION = '1.0.0'
export const SUPPORT_EMAIL = 'support@vitatrack.app'
export const PRIVACY_POLICY_URL = 'https://vitatrack.app/privacy'
export const TERMS_URL = 'https://vitatrack.app/terms'
// Env-driven so mobile builds point at the right web host per environment.
// Expo inlines EXPO_PUBLIC_* at build time; falls back to production.
export const ICE_BASE_URL =
  process.env.EXPO_PUBLIC_ICE_BASE_URL ?? 'https://vitatrack.app/ice'

export const STORAGE_BUCKET = 'health-documents'
export const MAX_FILE_SIZE_MB = 50
export const MAX_STORAGE_MB = 500

export const MISSED_DOSE_ALERT_MINUTES = 30
export const BIOMETRIC_LOCK_MINUTES = 5
export const DOSE_EDIT_WINDOW_HOURS = 2

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] as const

export const SA_TIMEZONE = 'Africa/Johannesburg'

export const MEAL_CONTEXTS = [
  { value: 'fasting',     label: 'Fasting' },
  { value: 'before_meal', label: 'Before meal' },
  { value: 'after_meal',  label: 'After meal' },
  { value: 'bedtime',     label: 'Bedtime' },
  { value: 'random',      label: 'Random' },
] as const

export const BP_POSITIONS = [
  { value: 'sitting',  label: 'Sitting' },
  { value: 'standing', label: 'Standing' },
  { value: 'lying',    label: 'Lying down' },
] as const

export const DOCUMENT_CATEGORIES = [
  { value: 'prescription', label: 'Prescription',  icon: '💊' },
  { value: 'lab_result',   label: 'Lab Result',    icon: '🧪' },
  { value: 'imaging',      label: 'Imaging',       icon: '🩻' },
  { value: 'insurance',    label: 'Insurance',     icon: '🏥' },
  { value: 'hospital',     label: 'Hospital',      icon: '🏨' },
  { value: 'other',        label: 'Other',         icon: '📄' },
] as const
