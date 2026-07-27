import { create } from 'zustand'
import { getSupabaseClient } from '@vitatrack/shared'
import type {
  Medication, MedicationSchedule, DoseLog, DoseStatus,
  MedicationWithSchedules, DoseLogWithMedication, RefillAlert,
} from '@vitatrack/shared'

type MedicationsState = {
  medications: MedicationWithSchedules[]
  isLoading: boolean
  // Queries
  fetchMedications: () => Promise<MedicationWithSchedules[]>
  fetchTodayDoses: () => Promise<DoseLogWithMedication[]>
  fetchRefillAlerts: () => Promise<RefillAlert[]>
  fetchDoseHistory: (medicationId: string, days?: number) => Promise<DoseLog[]>
  // Mutations
  addMedication: (med: Omit<Medication, 'id' | 'created_at' | 'updated_at'>, schedules: Omit<MedicationSchedule, 'id' | 'medication_id' | 'created_at' | 'updated_at'>[]) => Promise<string | null>
  updateMedication: (id: string, updates: Partial<Medication>) => Promise<string | null>
  archiveMedication: (id: string) => Promise<string | null>
  logDose: (payload: { medication_id: string; schedule_id?: string; scheduled_at?: string; status: DoseStatus; notes?: string; dose_amount?: number; dose_unit?: string }) => Promise<string | null>
  updatePillCount: (medicationId: string, newCount: number) => Promise<string | null>
}

export const useMedicationsStore = create<MedicationsState>((set, get) => ({
  medications: [],
  isLoading: false,

  fetchMedications: async () => {
    set({ isLoading: true })
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('medications')
      .select(`*, schedules:medication_schedules(*)`)
      .order('name')
    set({ isLoading: false })
    if (error) { console.error(error); return [] }
    const meds = data as MedicationWithSchedules[]
    set({ medications: meds })
    return meds
  },

  fetchTodayDoses: async () => {
    const supabase = getSupabaseClient()
    const today = new Date()
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
    const endOfDay   = new Date(today.setHours(23, 59, 59, 999)).toISOString()

    const { data, error } = await supabase
      .from('dose_logs')
      .select(`*, medication:medications(name, form, strength, strength_unit, color)`)
      .gte('scheduled_at', startOfDay)
      .lte('scheduled_at', endOfDay)
      .order('scheduled_at')

    if (error) { console.error(error); return [] }
    return (data ?? []) as DoseLogWithMedication[]
  },

  fetchRefillAlerts: async () => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('refill_alerts').select('*')
    if (error) { console.error(error); return [] }
    return (data ?? []) as RefillAlert[]
  },

  fetchDoseHistory: async (medicationId, days = 90) => {
    const supabase = getSupabaseClient()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const { data, error } = await supabase
      .from('dose_logs')
      .select('*')
      .eq('medication_id', medicationId)
      .gte('scheduled_at', cutoff.toISOString())
      .order('scheduled_at', { ascending: false })
    if (error) { console.error(error); return [] }
    return (data ?? []) as DoseLog[]
  },

  addMedication: async (med, schedules) => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Not authenticated'

    const { data: newMed, error: medErr } = await supabase
      .from('medications')
      .insert({ ...med, profile_id: user.id })
      .select()
      .single()
    if (medErr) return medErr.message

    if (schedules.length > 0) {
      const { error: schErr } = await supabase
        .from('medication_schedules')
        .insert(schedules.map(s => ({ ...s, medication_id: newMed.id })))
      if (schErr) return schErr.message
    }

    await get().fetchMedications()
    return null
  },

  updateMedication: async (id, updates) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('medications')
      .update(updates)
      .eq('id', id)
    if (error) return error.message
    await get().fetchMedications()
    return null
  },

  archiveMedication: async (id) => {
    return get().updateMedication(id, { is_active: false })
  },

  logDose: async (payload) => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Not authenticated'

    const { error } = await supabase.from('dose_logs').insert({
      ...payload,
      profile_id: user.id,
      logged_by: user.id,
      logged_at: new Date().toISOString(),
    })
    return error?.message ?? null
  },

  updatePillCount: async (medicationId, newCount) => {
    return get().updateMedication(medicationId, { pill_count: newCount })
  },
}))
