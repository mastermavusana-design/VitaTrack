'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Modal from '@/components/ui/Modal'

const CATEGORIES = [
  { value: 'prescription', label: '💊 Prescription' },
  { value: 'lab_result',   label: '🧪 Lab result' },
  { value: 'imaging',      label: '🩻 Imaging' },
  { value: 'insurance',    label: '📄 Insurance' },
  { value: 'hospital',     label: '🏥 Hospital' },
  { value: 'other',        label: '📎 Other' },
]

const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export default function AddDocumentButton() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('lab_result')
  const [notes, setNotes] = useState('')

  function reset() { setFile(null); setCategory('lab_result'); setNotes(''); setError(null) }

  async function submit() {
    if (!file) { setError('Please choose a file'); return }
    if (file.size > MAX_BYTES) { setError('File is larger than 15 MB'); return }
    setSaving(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Your session expired — please sign in again'); setSaving(false); return }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user.id}/${Date.now()}_${safeName}`

      const { error: upErr } = await supabase.storage
        .from('health-documents')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (upErr) { setError(`Upload failed: ${upErr.message}`); setSaving(false); return }

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          file_type: file.type || null,
          storage_path: path,
          file_size_bytes: file.size,
          original_name: file.name,
          category,
          notes,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Roll back the orphaned upload if metadata save failed.
        await supabase.storage.from('health-documents').remove([path])
        setError(json.error ?? 'Could not save document'); setSaving(false); return
      }
      setOpen(false); reset(); router.refresh()
    } catch {
      setError('Something went wrong — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary text-sm">+ Upload document</button>

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Upload document"
        footer={
          <>
            <button onClick={() => setOpen(false)} disabled={saving} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Uploading…' : 'Upload'}
            </button>
          </>
        }
      >
        {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">File</label>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-brand-900 file:font-semibold hover:file:bg-brand-100"
          />
          <p className="text-xs text-gray-400 mt-1">PDF or image, up to 15 MB.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
          <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </Modal>
    </>
  )
}
