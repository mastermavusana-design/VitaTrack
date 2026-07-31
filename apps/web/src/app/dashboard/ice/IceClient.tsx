'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']

interface Contact { name: string; relationship: string; phone: string }
interface Ice {
  blood_type: string | null
  allergies: string[] | null
  conditions: string[] | null
  current_medications: string[] | null
  emergency_contacts: Contact[] | null
  organ_donor: boolean | null
  do_not_resuscitate: boolean | null
  additional_notes: string | null
  is_public: boolean | null
  qr_token: string | null
}

export default function IceClient({ initial }: { initial: Ice | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [bloodType, setBloodType] = useState(initial?.blood_type ?? '')
  const [allergies, setAllergies] = useState((initial?.allergies ?? []).join(', '))
  const [conditions, setConditions] = useState((initial?.conditions ?? []).join(', '))
  const [medications, setMedications] = useState((initial?.current_medications ?? []).join(', '))
  const [notes, setNotes] = useState(initial?.additional_notes ?? '')
  const [organDonor, setOrganDonor] = useState(!!initial?.organ_donor)
  const [dnr, setDnr] = useState(!!initial?.do_not_resuscitate)
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? true)
  const [contacts, setContacts] = useState<Contact[]>(
    initial?.emergency_contacts?.length ? initial.emergency_contacts : [{ name: '', relationship: '', phone: '' }],
  )

  const shareUrl = initial?.qr_token
    ? (typeof window !== 'undefined' ? `${window.location.origin}/ice/${initial.qr_token}` : `/ice/${initial.qr_token}`)
    : null

  function updateContact(i: number, key: keyof Contact, value: string) {
    setContacts(cs => cs.map((c, idx) => idx === i ? { ...c, [key]: value } : c))
  }

  async function save() {
    setSaving(true); setError(null); setMsg(null)
    try {
      const res = await fetch('/api/ice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blood_type: bloodType || null,
          allergies, conditions, current_medications: medications,
          emergency_contacts: contacts,
          organ_donor: organDonor,
          do_not_resuscitate: dnr,
          additional_notes: notes,
          is_public: isPublic,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not save'); return }
      setMsg('Emergency profile saved')
      setTimeout(() => setMsg(null), 2500)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Emergency Profile (ICE)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Critical information for first responders. Shown on your public QR page when sharing is on.
        </p>
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}
      {msg && <div className="rounded-xl bg-green-50 text-green-700 text-sm px-4 py-3 border border-green-100">{msg}</div>}

      <div className="card p-5 space-y-4">
        <Field label="Blood type">
          <select className="input" value={bloodType} onChange={e => setBloodType(e.target.value)}>
            <option value="">Select…</option>
            {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>

        <Field label="Allergies" hint="Comma-separated, e.g. Penicillin, Peanuts">
          <textarea className="input min-h-[60px]" value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="Penicillin, Peanuts" />
        </Field>

        <Field label="Medical conditions" hint="Comma-separated">
          <textarea className="input min-h-[60px]" value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Type 2 Diabetes, Hypertension" />
        </Field>

        <Field label="Current medications" hint="Comma-separated">
          <textarea className="input min-h-[60px]" value={medications} onChange={e => setMedications(e.target.value)} placeholder="Metformin, Amlodipine" />
        </Field>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Emergency contacts</h2>
        {contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className="input" value={c.name} onChange={e => updateContact(i, 'name', e.target.value)} placeholder="Name" />
            <input className="input" value={c.relationship} onChange={e => updateContact(i, 'relationship', e.target.value)} placeholder="Relationship" />
            <div className="flex gap-2">
              <input className="input" value={c.phone} onChange={e => updateContact(i, 'phone', e.target.value)} placeholder="Phone" />
              {contacts.length > 1 && (
                <button type="button" onClick={() => setContacts(cs => cs.filter((_, idx) => idx !== i))}
                  className="text-red-500 px-2 shrink-0" aria-label="Remove contact">✕</button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setContacts(cs => [...cs, { name: '', relationship: '', phone: '' }])}
          className="text-brand-900 text-sm font-semibold">+ Add contact</button>
      </div>

      <div className="card p-5 space-y-4">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Organ donor</span>
          <input type="checkbox" checked={organDonor} onChange={e => setOrganDonor(e.target.checked)} className="w-5 h-5 accent-brand-900" />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Do not resuscitate (DNR)</span>
          <input type="checkbox" checked={dnr} onChange={e => setDnr(e.target.checked)} className="w-5 h-5 accent-brand-900" />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Share via public QR page</span>
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="w-5 h-5 accent-brand-900" />
        </label>
        <Field label="Additional notes">
          <textarea className="input min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything a first responder should know" />
        </Field>
      </div>

      {shareUrl && isPublic && (
        <div className="card p-4 bg-brand-50 border-brand-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Public emergency link</p>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-brand-900 text-sm font-semibold break-all underline">
            {shareUrl}
          </a>
        </div>
      )}

      <button onClick={save} disabled={saving} className="btn-primary w-full">
        {saving ? 'Saving…' : 'Save emergency profile'}
      </button>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
