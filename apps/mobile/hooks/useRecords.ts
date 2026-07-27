import { create } from 'zustand'
import { getSupabaseClient } from '@vitatrack/shared'
import type { DoctorVisit, HealthDocument } from '@vitatrack/shared'

type RecordsState = {
  visits: DoctorVisit[]
  documents: HealthDocument[]
  isLoading: boolean

  fetchVisits: () => Promise<DoctorVisit[]>
  fetchDocuments: (category?: string) => Promise<HealthDocument[]>
  addVisit: (visit: Omit<DoctorVisit, 'id' | 'created_at' | 'profile_id'>) => Promise<string | null>
  updateVisit: (id: string, updates: Partial<DoctorVisit>) => Promise<string | null>
  deleteVisit: (id: string) => Promise<string | null>
  uploadDocument: (visitId: string | null, file: { uri: string; name: string; type: string }, category: string, notes?: string) => Promise<string | null>
  deleteDocument: (id: string, storagePath: string) => Promise<string | null>
  getSignedUrl: (storagePath: string) => Promise<string | null>
}

export const useRecordsStore = create<RecordsState>((set, get) => ({
  visits: [],
  documents: [],
  isLoading: false,

  fetchVisits: async () => {
    set({ isLoading: true })
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('doctor_visits')
      .select('*, documents:health_documents(id, category, file_name, created_at)')
      .order('visit_date', { ascending: false })
    set({ isLoading: false })
    if (error) { console.error(error); return [] }
    const visits = (data ?? []) as DoctorVisit[]
    set({ visits })
    return visits
  },

  fetchDocuments: async (category) => {
    const supabase = getSupabaseClient()
    let q = supabase
      .from('health_documents')
      .select('*')
      .order('created_at', { ascending: false })
    if (category && category !== 'all') q = q.eq('category', category)
    const { data, error } = await q
    if (error) { console.error(error); return [] }
    const documents = (data ?? []) as HealthDocument[]
    set({ documents })
    return documents
  },

  addVisit: async (visit) => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Not authenticated'
    const { error } = await supabase
      .from('doctor_visits')
      .insert({ ...visit, profile_id: user.id })
    if (error) return error.message
    await get().fetchVisits()
    return null
  },

  updateVisit: async (id, updates) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('doctor_visits').update(updates).eq('id', id)
    if (error) return error.message
    await get().fetchVisits()
    return null
  },

  deleteVisit: async (id) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('doctor_visits').delete().eq('id', id)
    return error?.message ?? null
  },

  uploadDocument: async (visitId, file, category, notes) => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Not authenticated'

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop()
    const storagePath = `${user.id}/${Date.now()}_${file.name}`

    const formData = new FormData()
    formData.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob)

    const { data: storageData, error: storageError } = await supabase.storage
      .from('health-documents')
      .upload(storagePath, formData, { contentType: file.type, upsert: false })

    if (storageError) return storageError.message

    // Insert DB record
    const { error: dbError } = await supabase.from('health_documents').insert({
      profile_id: user.id,
      visit_id: visitId,
      category,
      file_name: file.name,
      file_type: file.type,
      storage_path: storageData.path,
      notes: notes ?? null,
    })

    if (dbError) return dbError.message
    await get().fetchDocuments()
    return null
  },

  getSignedUrl: async (storagePath) => {
    const supabase = getSupabaseClient()
    const { data } = await supabase.storage
      .from('health-documents')
      .createSignedUrl(storagePath, 60 * 60) // 1 hour
    return data?.signedUrl ?? null
  },

  deleteDocument: async (id, storagePath) => {
    const supabase = getSupabaseClient()
    const { error: storageError } = await supabase.storage
      .from('health-documents')
      .remove([storagePath])
    if (storageError) console.warn('Storage delete error:', storageError.message)

    const { error } = await supabase.from('health_documents').delete().eq('id', id)
    return error?.message ?? null
  },
}))
