'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import {
  MEDICATION_FORMS,
  STRENGTH_UNITS,
  FREQUENCY_OPTIONS,
  DEFAULT_TIMES,
  COMMON_MEDICATIONS_SA,
} from '@vitatrack/shared'

const MED_COLORS = ['#1A569B', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#BE185D']

export interface MedInitial {
  id: string
  name: string
  generic_name?: string | null
  form?: string | null
  strength?: number | string | null
  strength_unit?: string | null
  instructions?: string | null
  prescriber?: string | null
  pill_count?: number | string | null
  refill_threshold?: number | string | null
  color?: string | null
  reminder_enabled?: boolean | null
  schedules?: { frequency?: string; times?: string[] }[] | null
}

interface Props {
  open: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  initial?: MedInitial
  /** Optional scanned barcode to record against a new medication. */
  barcode?: string
}

export default function MedicationForm({ open, onClose, mode, initial, barcode }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sched = initial?.schedules?.[0]
  const [name, setName] = useState(initial?.name ?? '')
  const [genericName, setGenericName] = useState(initial?.generic_name ?? '')
  const [form, setForm] = useState(initial?.form ?? 'tablet')
  const [strength, setStrength] = useState(initial?.strength != null ? String(initial.strength) : '')
  const [strengthUnit, setStrengthUnit] = useState(initial?.strength_unit ?? 'mg')
  const [instructions, setInstructions] = useState(
    initial?.instructions ?? (barcode ? `Barcode: ${barcode}` : ''),
  )
  const [prescriber, setPrescriber] = useState(initial?.prescriber ?? '')
  const [pillCount, setPillCount] = useState(initial?.pill_count != null ? String(initial.pill_count) : '')
  const [refillThreshold, setRefillThreshold] = useState(initial?.refill_threshold != null ? String(initial.refill_threshold) : '')
  const [color, setColor] = useState(initial?.color ?? MED_COLORS[0])
  const [frequency, setFrequency] = useState(sched?.frequency ?? 'daily')
  const [times, setTimes] = useState<string[]>(sched?.times?.length ? sched.times : ['08:00'])
  const [reminderEnabled, setReminderEnabled] = useState(initial?.reminder_enabled ?? true)

  function onFrequencyChange(fq: string) {
    setFrequency(fq)
    setTimes(DEFAULT_TIMES[fq]?.length ? [...DEFAULT_TIMES[fq]] : fq === 'as_needed' ? [] : ['08:00'])
  }

  async function submit() {
    if (!name.trim()) { setError('Medication name is required'); return }
    setSaving(true); setError(null)
    const payload = {
      name: name.trim(),
      generic_name: genericName?.trim() || null,
      form,
      strength: strength || null,
      strength_unit: strengthUnit,
      instructions: instructions?.trim() || null,
      prescriber: prescriber?.trim() || null,
      pill_count: pillCount || null,
      refill_threshold: refillThreshold || null,
      color,
      reminder_enabled: reminderEnabled,
      frequency,
      times,
    }
    try {
      const res = await fetch(
        mode === 'add' ? '/api/medications' : `/api/medications/${initial!.id}`,
        {
          method: mode === 'add' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not save medication'); setSaving(false); return }
      onClose()
      router.refresh()
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
      title={mode === 'add' ? 'Add medication' : 'Edit medication'}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : mode === 'add' ? 'Save medication' : 'Save changes'}
          </button>
        </>
      }
    >
      {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}

      <Field label="Medication name" required>
        <input className="input" list="common-meds" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Amlodipine" autoFocus />
        <datalist id="common-meds">{COMMON_MEDICATIONS_SA.map(m => <option key={m} value={m} />)}</datalist>
      </Field>

      <Field label="Generic name">
        <input className="input" value={genericName ?? ''} onChange={e => setGenericName(e.target.value)} placeholder="Optional" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Form">
          <select className="input" value={form ?? 'tablet'} onChange={e => setForm(e.target.value)}>
            {MEDICATION_FORMS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Colour">
          <div className="flex flex-wrap gap-2 pt-1">
            {MED_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`colour ${c}`}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Strength">
          <input className="input" type="number" min="0" value={strength} onChange={e => setStrength(e.target.value)} placeholder="e.g. 5" />
        </Field>
        <Field label="Unit">
          <select className="input" value={strengthUnit ?? 'mg'} onChange={e => setStrengthUnit(e.target.value)}>
            {STRENGTH_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Frequency">
        <select className="input" value={frequency} onChange={e => onFrequencyChange(e.target.value)}>
          {FREQUENCY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </Field>

      {frequency !== 'as_needed' && (
        <Field label="Reminder times">
          <div className="space-y-2">
            {times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="time" className="input" value={t}
                  onChange={e => setTimes(ts => ts.map((tt, idx) => idx === i ? e.target.value : tt))} />
                {times.length > 1 && (
                  <button type="button" onClick={() => setTimes(ts => ts.filter((_, idx) => idx !== i))}
                    className="text-red-500 text-sm px-2">Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setTimes(ts => [...ts, '08:00'])} className="text-brand-900 text-sm font-semibold">+ Add time</button>
          </div>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Pills remaining">
          <input className="input" type="number" min="0" value={pillCount} onChange={e => setPillCount(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Refill alert at">
          <input className="input" type="number" min="0" value={refillThreshold} onChange={e => setRefillThreshold(e.target.value)} placeholder="Optional" />
        </Field>
      </div>

      <Field label="Instructions">
        <input className="input" value={instructions ?? ''} onChange={e => setInstructions(e.target.value)} placeholder="e.g. Take with food" />
      </Field>

      <Field label="Prescriber">
        <input className="input" value={prescriber ?? ''} onChange={e => setPrescriber(e.target.value)} placeholder="Optional" />
      </Field>

      <label className="flex items-center justify-between py-1">
        <span className="text-sm font-medium text-gray-700">Enable reminders</span>
        <input type="checkbox" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)} className="w-5 h-5 accent-brand-900" />
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
