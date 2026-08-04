'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { CLIENT_DIRECT, queuedInsert, currentUserId } from '@/lib/dataStore'

const VISIT_TYPES = [
  { value: 'gp',         label: '👨‍⚕️ GP' },
  { value: 'specialist', label: '🔬 Specialist' },
  { value: 'emergency',  label: '🚑 Emergency' },
  { value: 'dentist',    label: '🦷 Dentist' },
  { value: 'pharmacy',   label: '💊 Pharmacy' },
  { value: 'other',      label: '🏥 Other' },
]

export default function AddVisitButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const [f, setF] = useState<Record<string, string>>({ visit_type: 'gp', visit_date: today })
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }))

  async function submit() {
    if (!f.visit_date) { setError('Visit date is required'); return }
    setSaving(true); setError(null)

    // ── R1 client-direct path (flagged; doctor_visits insert under own-CRUD RLS). ──
    if (CLIENT_DIRECT) {
      const uid = await currentUserId()
      if (!uid) { setError('Session expired — please sign in again'); setSaving(false); return }
      const VALID = ['gp', 'specialist', 'emergency', 'dentist', 'pharmacy', 'other']
      const t = (s?: string) => (s && s.trim()) ? s.trim() : null
      const res = await queuedInsert('doctor_visits', {
        profile_id:     uid,
        visit_date:     f.visit_date,
        visit_type:     VALID.includes(f.visit_type) ? f.visit_type : 'other',
        provider_name:  t(f.provider_name) ?? t(f.doctor_name),
        specialty:      t(f.specialty),
        facility:       t(f.facility),
        reason:         t(f.reason),
        diagnosis:      t(f.diagnosis),
        treatment:      t(f.treatment),
        follow_up_date: f.follow_up_date || null,
        notes:          t(f.notes),
      })
      if (!res.ok) { setError(res.error); setSaving(false); return }
      setOpen(false)
      setF({ visit_type: 'gp', visit_date: today })
      if (!res.queued) router.refresh()
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/doctor-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not save visit'); setSaving(false); return }
      setOpen(false)
      setF({ visit_type: 'gp', visit_date: today })
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">+ Add visit</button>

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Record a visit"
        footer={
          <>
            <button onClick={() => setOpen(false)} disabled={saving} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Save visit'}
            </button>
          </>
        }
      >
        {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}

        <Field label="Visit type">
          <select className="input" value={f.visit_type} onChange={e => set('visit_type', e.target.value)}>
            {VISIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Visit date" required>
            <input className="input" type="date" value={f.visit_date} onChange={e => set('visit_date', e.target.value)} />
          </Field>
          <Field label="Follow-up date">
            <input className="input" type="date" value={f.follow_up_date ?? ''} onChange={e => set('follow_up_date', e.target.value)} />
          </Field>
        </div>

        <Field label="Doctor / provider">
          <input className="input" value={f.provider_name ?? ''} onChange={e => set('provider_name', e.target.value)} placeholder="e.g. Dr Nkosi" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Specialty">
            <input className="input" value={f.specialty ?? ''} onChange={e => set('specialty', e.target.value)} placeholder="e.g. Cardiology" />
          </Field>
          <Field label="Facility">
            <input className="input" value={f.facility ?? ''} onChange={e => set('facility', e.target.value)} placeholder="e.g. Netcare" />
          </Field>
        </div>

        <Field label="Reason for visit">
          <input className="input" value={f.reason ?? ''} onChange={e => set('reason', e.target.value)} placeholder="Optional" />
        </Field>

        <Field label="Diagnosis">
          <input className="input" value={f.diagnosis ?? ''} onChange={e => set('diagnosis', e.target.value)} placeholder="Optional" />
        </Field>

        <Field label="Treatment">
          <input className="input" value={f.treatment ?? ''} onChange={e => set('treatment', e.target.value)} placeholder="Optional" />
        </Field>

        <Field label="Notes">
          <textarea className="input min-h-[70px]" value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
        </Field>
      </Modal>
    </>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  )
}
