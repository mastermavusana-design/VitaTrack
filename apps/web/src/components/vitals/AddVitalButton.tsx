'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { MEAL_CONTEXTS, BP_POSITIONS } from '@vitatrack/shared'
import type { VitalType } from '@vitatrack/shared'

const TYPES: { value: VitalType; label: string }[] = [
  { value: 'blood_pressure', label: '❤️ Blood Pressure' },
  { value: 'glucose',        label: '🩸 Glucose' },
  { value: 'weight',         label: '⚖️ Weight' },
  { value: 'temperature',    label: '🌡️ Temperature' },
  { value: 'spo2',           label: '💨 SpO2' },
  { value: 'heart_rate',     label: '💓 Heart Rate' },
]

export default function AddVitalButton({ defaultType }: { defaultType?: VitalType }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState<VitalType>(defaultType ?? 'blood_pressure')
  const [f, setF] = useState<Record<string, string>>({
    glucose_unit: 'mmol/L', weight_unit: 'kg', temp_unit: '°C', meal_context: 'random',
  })
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }))

  function reset() {
    setF({ glucose_unit: 'mmol/L', weight_unit: 'kg', temp_unit: '°C', meal_context: 'random' })
    setError(null)
  }

  async function submit() {
    setSaving(true); setError(null)
    const payload: Record<string, unknown> = { type }
    if (f.notes) payload.notes = f.notes
    switch (type) {
      case 'blood_pressure':
        payload.systolic = f.systolic; payload.diastolic = f.diastolic
        if (f.pulse) payload.pulse = f.pulse
        if (f.bp_position) payload.bp_position = f.bp_position
        break
      case 'glucose':
        payload.glucose_value = f.glucose_value; payload.glucose_unit = f.glucose_unit
        payload.meal_context = f.meal_context
        break
      case 'weight':
        payload.weight_value = f.weight_value; payload.weight_unit = f.weight_unit
        break
      case 'temperature':
        payload.temp_value = f.temp_value; payload.temp_unit = f.temp_unit
        break
      case 'spo2':
        payload.spo2_value = f.spo2_value
        break
      case 'heart_rate':
        payload.heart_rate = f.heart_rate
        break
    }
    try {
      const res = await fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not save reading'); setSaving(false); return }
      setOpen(false); reset(); router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">+ Add reading</button>

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Add vital reading"
        footer={
          <>
            <button onClick={() => setOpen(false)} disabled={saving} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Save reading'}
            </button>
          </>
        }
      >
        {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}

        <Field label="Type">
          <select className="input" value={type} onChange={e => setType(e.target.value as VitalType)}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        {type === 'blood_pressure' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Systolic (mmHg)" required>
                <input className="input" type="number" inputMode="numeric" value={f.systolic ?? ''} onChange={e => set('systolic', e.target.value)} placeholder="120" autoFocus />
              </Field>
              <Field label="Diastolic (mmHg)" required>
                <input className="input" type="number" inputMode="numeric" value={f.diastolic ?? ''} onChange={e => set('diastolic', e.target.value)} placeholder="80" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pulse (bpm)">
                <input className="input" type="number" inputMode="numeric" value={f.pulse ?? ''} onChange={e => set('pulse', e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Position">
                <select className="input" value={f.bp_position ?? ''} onChange={e => set('bp_position', e.target.value)}>
                  <option value="">—</option>
                  {BP_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
            </div>
          </>
        )}

        {type === 'glucose' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Glucose" required>
                <input className="input" type="number" step="0.1" inputMode="decimal" value={f.glucose_value ?? ''} onChange={e => set('glucose_value', e.target.value)} placeholder="5.5" autoFocus />
              </Field>
              <Field label="Unit">
                <select className="input" value={f.glucose_unit} onChange={e => set('glucose_unit', e.target.value)}>
                  <option value="mmol/L">mmol/L</option>
                  <option value="mg/dL">mg/dL</option>
                </select>
              </Field>
            </div>
            <Field label="Meal context">
              <select className="input" value={f.meal_context} onChange={e => set('meal_context', e.target.value)}>
                {MEAL_CONTEXTS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
          </>
        )}

        {type === 'weight' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight" required>
              <input className="input" type="number" step="0.1" inputMode="decimal" value={f.weight_value ?? ''} onChange={e => set('weight_value', e.target.value)} placeholder="70" autoFocus />
            </Field>
            <Field label="Unit">
              <select className="input" value={f.weight_unit} onChange={e => set('weight_unit', e.target.value)}>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </select>
            </Field>
          </div>
        )}

        {type === 'temperature' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Temperature" required>
              <input className="input" type="number" step="0.1" inputMode="decimal" value={f.temp_value ?? ''} onChange={e => set('temp_value', e.target.value)} placeholder="36.6" autoFocus />
            </Field>
            <Field label="Unit">
              <select className="input" value={f.temp_unit} onChange={e => set('temp_unit', e.target.value)}>
                <option value="°C">°C</option>
                <option value="°F">°F</option>
              </select>
            </Field>
          </div>
        )}

        {type === 'spo2' && (
          <Field label="SpO2 (%)" required>
            <input className="input" type="number" inputMode="numeric" value={f.spo2_value ?? ''} onChange={e => set('spo2_value', e.target.value)} placeholder="98" autoFocus />
          </Field>
        )}

        {type === 'heart_rate' && (
          <Field label="Heart rate (bpm)" required>
            <input className="input" type="number" inputMode="numeric" value={f.heart_rate ?? ''} onChange={e => set('heart_rate', e.target.value)} placeholder="72" autoFocus />
          </Field>
        )}

        <Field label="Notes">
          <input className="input" value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
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
