import { create } from 'zustand'
import {
  getSupabaseClient,
  ACTIVE_VACCINE_SCHEDULE_VER,
  ACTIVE_MILESTONE_SCHEDULE_VER,
} from '@vitatrack/shared'
import type { Dependant, Immunisation, GrowthMeasurement, Milestone } from '@vitatrack/shared'

export type ChildBundle = {
  dependant: Dependant | null
  immunisations: Immunisation[]
  measurements: GrowthMeasurement[]
  milestones: Milestone[]
}

export type GrowthInput = {
  measured_at: string
  weight_kg?: number | null
  length_cm?: number | null
  head_circ_cm?: number | null
  muac_cm?: number | null
}

/** A due dose used to schedule local booster reminders. */
export type DueImmunisation = {
  id: string
  vaccine_name: string
  dose_label: string | null
  due_date: string
  dependant: { full_name: string } | null
}

/**
 * Child-health store (Phase 5). Online-first via Supabase under RLS, mirroring
 * useMedications. Adding a child inserts the dependant then expands the active
 * immunisation + milestone reference schedules into per-child rows (server RPCs).
 */

export type DependantInput = {
  full_name: string
  date_of_birth: string
  sex?: 'male' | 'female' | null
  birth_weight_g?: number | null
  gestational_age_wk?: number | null
  relationship?: string | null
  rthb_number?: string | null
}

type ChildrenState = {
  dependants: Dependant[]
  isLoading: boolean
  fetchDependants: () => Promise<Dependant[]>
  addDependant: (input: DependantInput) => Promise<string | null>
  fetchChildBundle: (dependantId: string) => Promise<ChildBundle>
  updateImmunisation: (id: string, patch: Partial<Immunisation>) => Promise<string | null>
  updateMilestone: (id: string, patch: Partial<Milestone>) => Promise<string | null>
  addGrowthMeasurement: (dependantId: string, input: GrowthInput) => Promise<string | null>
  fetchDueImmunisations: () => Promise<DueImmunisation[]>
}

export const useChildrenStore = create<ChildrenState>((set, get) => ({
  dependants: [],
  isLoading: false,

  fetchDependants: async () => {
    set({ isLoading: true })
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { set({ isLoading: false }); return [] }

    const { data, error } = await supabase
      .from('dependants')
      .select('*')
      .eq('guardian_id', user.id)
      .is('archived_at', null)
      .order('date_of_birth', { ascending: true })

    set({ isLoading: false })
    if (error) { console.error(error); return [] }
    const rows = (data ?? []) as Dependant[]
    set({ dependants: rows })
    return rows
  },

  addDependant: async (input) => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Not authenticated'

    const { data: child, error } = await supabase
      .from('dependants')
      .insert({
        guardian_id:        user.id,
        full_name:          input.full_name.trim(),
        date_of_birth:      input.date_of_birth,
        sex:                input.sex ?? null,
        birth_weight_g:     input.birth_weight_g ?? null,
        gestational_age_wk: input.gestational_age_wk ?? null,
        relationship:       input.relationship ?? null,
        rthb_number:        input.rthb_number ?? null,
        popia_consent:      true,
        popia_consent_at:   new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error) return error.message

    // Expand the active reference schedules into per-child rows (best-effort:
    // the child is saved, so surface nothing fatal if expansion hiccups).
    const [imm, mil] = await Promise.all([
      supabase.rpc('expand_immunisation_schedule', { dep: child.id, ver: ACTIVE_VACCINE_SCHEDULE_VER }),
      supabase.rpc('expand_milestone_schedule',    { dep: child.id, ver: ACTIVE_MILESTONE_SCHEDULE_VER }),
    ])
    if (imm.error) console.warn('[useChildren] immunisation expand:', imm.error.message)
    if (mil.error) console.warn('[useChildren] milestone expand:', mil.error.message)

    await get().fetchDependants()
    return null
  },

  fetchChildBundle: async (dependantId) => {
    const supabase = getSupabaseClient()
    const [dep, imm, growth, mil] = await Promise.all([
      supabase.from('dependants').select('*').eq('id', dependantId).maybeSingle(),
      supabase.from('immunisations').select('*').eq('dependant_id', dependantId).order('due_date', { ascending: true }),
      supabase.from('growth_measurements').select('*').eq('dependant_id', dependantId).order('measured_at', { ascending: true }),
      supabase.from('milestones').select('*').eq('dependant_id', dependantId).order('created_at', { ascending: true }),
    ])
    return {
      dependant: (dep.data as Dependant) ?? null,
      immunisations: (imm.data ?? []) as Immunisation[],
      measurements: (growth.data ?? []) as GrowthMeasurement[],
      milestones: (mil.data ?? []) as Milestone[],
    }
  },

  updateImmunisation: async (id, patch) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('immunisations').update(patch).eq('id', id)
    return error?.message ?? null
  },

  updateMilestone: async (id, patch) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('milestones').update(patch).eq('id', id)
    return error?.message ?? null
  },

  addGrowthMeasurement: async (dependantId, input) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('growth_measurements').insert({
      dependant_id: dependantId,
      measured_at:  input.measured_at,
      weight_kg:    input.weight_kg ?? null,
      length_cm:    input.length_cm ?? null,
      head_circ_cm: input.head_circ_cm ?? null,
      muac_cm:      input.muac_cm ?? null,
      source:       'manual',
    })
    return error?.message ?? null
  },

  fetchDueImmunisations: async () => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Doses due within the next ~60 days (RLS scopes to the guardian's children).
    const horizon = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('immunisations')
      .select('id, vaccine_name, dose_label, due_date, dependant:dependants(full_name)')
      .eq('status', 'due')
      .eq('reminder_enabled', true)
      .not('due_date', 'is', null)
      .lte('due_date', horizon)
      .order('due_date', { ascending: true })

    if (error) { console.warn('[useChildren] due immunisations:', error.message); return [] }
    return (data ?? []) as unknown as DueImmunisation[]
  },
}))
