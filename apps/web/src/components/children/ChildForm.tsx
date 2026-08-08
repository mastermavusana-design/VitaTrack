'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { CLIENT_DIRECT, queuedInsert, currentUserId } from '@/lib/dataStore'
import { createClientComponentClient } from '@/lib/supabaseClient'
import {
  validateDependant,
  ACTIVE_VACCINE_SCHEDULE_VER,
  ACTIVE_MILESTONE_SCHEDULE_VER,
} from '@vitatrack/shared'

interface Props {
  open: boolean
  onClose: () => void
}

/** Optional non-negative integer from a form string, or 'bad'. */
function optInt(v: string): number | null | 'bad' {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 'bad'
}

export default function ChildForm({ open, onClose }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [sex, setSex] = useState<'' | 'male' | 'female'>('')
  const [relationship, setRelationship] = useState('')
  const [birthWeight, setBirthWeight] = useState('')
  const [gestAge, setGestAge] = useState('')
  const [rthbNumber, setRthbNumber] = useState('')
  const [consent, setConsent] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  function reset() {
    setFullName(''); setDob(''); setSex(''); setRelationship('')
    setBirthWeight(''); setGestAge(''); setRthbNumber(''); setConsent(false)
    setError(null)
  }

  async function submit() {
    setError(null)

    const bw = optInt(birthWeight)
    const ga = gestAge.trim() === '' ? null : Number(gestAge)
    if (bw === 'bad') { setError('Birth weight must be a non-negative number (grams)'); return }
    if (ga !== null && !Number.isFinite(ga)) { setError('Gestational age must be a number (weeks)'); return }

    const input = {
      full_name: fullName,
      date_of_birth: dob,
      sex: sex || null,
      birth_weight_g: bw,
      gestational_age_wk: ga,
      popia_consent: consent,
    }
    const v = validateDependant(input)
    if (!v.ok) { setError(v.error); return }

    setSaving(true)

    // ── R1 client-direct path (dependant insert + schedule expansion under RLS). ──
    if (CLIENT_DIRECT) {
      const uid = await currentUserId()
      if (!uid) { setError('Session expired — please sign in again'); setSaving(false); return }

      const childId = globalThis.crypto.randomUUID()
      const row: Record<string, unknown> = {
        id: childId,
        guardian_id: uid,
        full_name: fullName.trim(),
        date_of_birth: dob,
        sex: sex || null,
        birth_weight_g: bw,
        gestational_age_wk: ga,
        relationship: relationship.trim() || null,
        rthb_number: rthbNumber.trim() || null,
        popia_consent: true,
        popia_consent_at: new Date().toISOString(),
      }
      const res = await queuedInsert('dependants', row)
      if (!res.ok) { setError(res.error); setSaving(false); return }

      // Expand the active schedules into per-child rows. Only when the insert
      // actually reached the server (an offline-queued child is expanded later).
      if (!res.queued) {
        const sb = createClientComponentClient()
        await Promise.all([
          sb.rpc('expand_immunisation_schedule', { dep: childId, ver: ACTIVE_VACCINE_SCHEDULE_VER }),
          sb.rpc('expand_milestone_schedule',    { dep: childId, ver: ACTIVE_MILESTONE_SCHEDULE_VER }),
        ])
      }

      reset(); onClose()
      if (!res.queued) router.refresh()
      setSaving(false)
      return
    }

    // ── Flag-off /api fallback (server validates + expands). ──
    try {
      const res = await fetch('/api/dependants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, relationship: relationship.trim() || null, rthb_number: rthbNumber.trim() || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not add child'); setSaving(false); return }
      reset(); onClose(); router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Add child"
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Add child'}
          </button>
        </>
      }
    >
      {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}

      <Field label="Full name" required>
        <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Thandi Mavusana" autoFocus />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date of birth" required>
          <input className="input" type="date" max={today} value={dob} onChange={e => setDob(e.target.value)} />
        </Field>
        <Field label="Sex">
          <select className="input" value={sex} onChange={e => setSex(e.target.value as '' | 'male' | 'female')}>
            <option value="">Prefer not to say</option>
            <option value="female">Girl</option>
            <option value="male">Boy</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Birth weight (g)">
          <input className="input" type="number" min="0" value={birthWeight} onChange={e => setBirthWeight(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Gestational age (weeks)">
          <input className="input" type="number" min="0" value={gestAge} onChange={e => setGestAge(e.target.value)} placeholder="Optional" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Relationship">
          <input className="input" value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="e.g. child" />
        </Field>
        <Field label="RtHB / clinic number">
          <input className="input" value={rthbNumber} onChange={e => setRthbNumber(e.target.value)} placeholder="Optional" />
        </Field>
      </div>

      <label className="flex items-start gap-3 py-1 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="w-5 h-5 mt-0.5 accent-brand-900 shrink-0" />
        <span className="text-sm text-gray-600">
          I am this child&apos;s parent or legal guardian and I consent to VitaTrack storing their
          health information (POPIA). Required to add a child.
        </span>
      </label>
    </Modal>
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
