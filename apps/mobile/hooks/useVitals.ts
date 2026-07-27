import { create } from 'zustand'
import { getSupabaseClient } from '@vitatrack/shared'
import type { Vital, VitalType } from '@vitatrack/shared'

type VitalsState = {
  vitals: Vital[]
  isLoading: boolean
  fetchVitals: (type?: VitalType, days?: number) => Promise<Vital[]>
  fetchLatestVitals: () => Promise<Vital[]>
  addVital: (vital: Omit<Vital, 'id' | 'created_at' | 'profile_id'>) => Promise<string | null>
  deleteVital: (id: string) => Promise<string | null>
}

export const useVitalsStore = create<VitalsState>((set, get) => ({
  vitals: [],
  isLoading: false,

  fetchVitals: async (type, days = 90) => {
    set({ isLoading: true })
    const supabase = getSupabaseClient()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    let q = supabase.from('vitals').select('*').gte('recorded_at', cutoff.toISOString()).order('recorded_at', { ascending: false })
    if (type) q = q.eq('type', type)

    const { data, error } = await q
    set({ isLoading: false })
    if (error) { console.error(error); return [] }
    const vitals = (data ?? []) as Vital[]
    if (!type) set({ vitals })
    return vitals
  },

  fetchLatestVitals: async () => {
    const supabase = getSupabaseClient()
    const types: VitalType[] = ['blood_pressure', 'glucose', 'weight']
    const results = await Promise.all(
      types.map(type =>
        supabase.from('vitals').select('*').eq('type', type).order('recorded_at', { ascending: false }).limit(1).single()
      )
    )
    return results.map(r => r.data).filter(Boolean) as Vital[]
  },

  addVital: async (vital) => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Not authenticated'
    const { error } = await supabase.from('vitals').insert({ ...vital, profile_id: user.id })
    if (error) return error.message
    await get().fetchVitals(vital.type)
    return null
  },

  deleteVital: async (id) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('vitals').delete().eq('id', id)
    return error?.message ?? null
  },
}))
