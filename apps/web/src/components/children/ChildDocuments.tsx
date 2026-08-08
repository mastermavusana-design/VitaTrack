'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { CLIENT_DIRECT, queuedInsert, cachedSelect } from '@/lib/dataStore'
import type { HealthDocument } from '@vitatrack/shared'

/**
 * ChildDocuments — file and list Road to Health documents (immunisation cards,
 * growth charts, scanned RtHB pages) against a specific child. Reuses the proven
 * health-documents storage flow (bucket path {uid}/{ts}_{name}) with the new
 * dependant_id link. Client-direct write under own-CRUD RLS, /api fallback.
 */

const CATEGORIES = [
  { value: 'immunization', label: '💉 Immunisation card / certificate' },
  { value: 'growth_chart', label: '📈 Growth chart' },
  { value: 'other',        label: '📎 Other RtHB page' },
]
const MAX_BYTES = 15 * 1024 * 1024

export default function ChildDocuments({ dependantId }: { dependantId: string }) {
  const supabase = createClientComponentClient()
  const [docs, setDocs] = useState<HealthDocument[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('immunization')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await cachedSelect<HealthDocument>(`child-docs:${dependantId}`, (sb) =>
      sb.from('health_documents').select('*')
        .eq('dependant_id', dependantId)
        .order('created_at', { ascending: false }),
    )
    setDocs(res.rows)
  }
  useEffect(() => { void load() }, [dependantId])

  async function open(doc: HealthDocument) {
    const { data } = await supabase.storage.from('health-documents').createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function upload() {
    if (!file) { setError('Please choose a file'); return }
    if (file.size > MAX_BYTES) { setError('File is larger than 15 MB'); return }
    setSaving(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expired — please sign in again'); setSaving(false); return }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user.id}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage
        .from('health-documents')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (upErr) { setError(`Upload failed: ${upErr.message}`); setSaving(false); return }

      const row = {
        profile_id:      user.id,
        dependant_id:    dependantId,
        visit_id:        null,
        category,
        file_name:       file.name,
        file_type:       file.type || null,
        storage_path:    path,
        file_size_bytes: file.size,
        original_name:   file.name,
        source:          'manual',
        capture_id:      null,
      }

      if (CLIENT_DIRECT) {
        const res = await queuedInsert('health_documents', row)
        if (!res.ok) {
          await supabase.storage.from('health-documents').remove([path])
          setError(res.error); setSaving(false); return
        }
      } else {
        const res = await fetch('/api/documents', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...row, dependant_id: dependantId }),
        })
        if (!res.ok) {
          await supabase.storage.from('health-documents').remove([path])
          const j = await res.json().catch(() => ({}))
          setError(j.error ?? 'Could not save document'); setSaving(false); return
        }
      }

      setFile(null); setError(null)
      await load()
    } catch {
      setError('Something went wrong — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">Attach a document</p>
        <input
          type="file" accept="application/pdf,image/*"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-brand-900 file:font-semibold hover:file:bg-brand-100"
        />
        <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-2 border border-red-100">{error}</div>}
        <button onClick={upload} disabled={saving || !file} className="btn-primary text-sm disabled:opacity-60">
          {saving ? 'Uploading…' : 'Upload'}
        </button>
        <p className="text-xs text-gray-400">PDF or image, up to 15 MB. Stored privately in af-south-1.</p>
      </div>

      {docs === null ? (
        <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
      ) : docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
          No documents filed for this child yet.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{d.file_name}</p>
                <p className="text-xs text-gray-500">{d.category.replace('_', ' ')}</p>
              </div>
              <button onClick={() => open(d)} className="text-sm font-semibold text-brand-900 hover:underline shrink-0">Open</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
