'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { CLIENT_DIRECT, queuedInsert } from '@/lib/dataStore'
import { validateGrowthMeasurement } from '@vitatrack/shared'

interface Props {
  dependantId: string
}

/** Optional non-negative number from a form string, or 'bad'. */
function optNum(v: string): number | null | 'bad' {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 'bad'
}

export default function AddGrowthMeasurement({ dependantId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [measuredAt, setMeasuredAt] = useState(today)
  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [headCirc, setHeadCirc] = useState('')
  const [muac, setMuac] = useState('')

  function reset() {
    setMeasuredAt(today); setWeight(''); setLength(''); setHeadCirc(''); setMuac(''); setError(null)
  }

  async function submit() {
    setError(null)
    const w = optNum(weight), l = optNum(length), h = optNum(headCirc), m = optNum(muac)
    if ([w, l, h, m].includes('bad')) { setError('Measurements must be non-negative numbers'); return }

    const input = {
      measured_at: measuredAt,
      weight_kg: w as number | null,
      length_cm: l as number | null,
      head_circ_cm: h as number | null,
      muac_cm: m as number | null,
    }
    const v = validateGrowthMeasurement(input)
    if (!v.ok) { setError(v.error); return }

    setSaving(true)

    if (CLIENT_DIRECT) {
      const res = await queuedInsert('growth_measurements', {
        id: globalThis.crypto.randomUUID(),
        dependant_id: dependantId,
        ...input,
        source: 'manual',
      })
      if (!res.ok) { setError(res.error); setSaving(false); return }
      reset(); setOpen(false)
      if (!res.queued) router.refresh()
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/growth-measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependant_id: dependantId, ...input }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not save measurement'); setSaving(false); return }
      reset(); setOpen(false); router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">+ Add measurement</button>
      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Add growth measurement"
        footer={
          <>
            <button onClick={() => setOpen(false)} disabled={saving} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Save measurement'}
            </button>
          </>
        }
      >
        {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}
        <p className="text-xs text-gray-500 -mt-1">Enter at least one measurement.</p>

        <Field label="Date measured" required>
          <input className="input" type="date" max={today} value={measuredAt} onChange={e => setMeasuredAt(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (kg)">
            <input className="input" type="number" min="0" step="0.01" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 8.4" />
          </Field>
          <Field label="Length/height (cm)">
            <input className="input" type="number" min="0" step="0.1" value={length} onChange={e => setLength(e.target.value)} placeholder="e.g. 70" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Head circ. (cm)">
            <input className="input" type="number" min="0" step="0.1" value={headCirc} onChange={e => setHeadCirc(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="MUAC (cm)">
            <input className="input" type="number" min="0" step="0.1" value={muac} onChange={e => setMuac(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
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
