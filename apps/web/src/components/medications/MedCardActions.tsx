'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MedicationForm, { type MedInitial } from './MedicationForm'

/** Quick dose-logging (Take / Skip), edit and archive controls for a medication card. */
export default function MedCardActions({ med }: { med: MedInitial }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  async function logDose(status: 'taken' | 'skipped') {
    setBusy(status)
    try {
      const res = await fetch('/api/dose-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medication_id: med.id, status, logged_at: new Date().toISOString() }),
      })
      if (res.ok) {
        setFlash(status === 'taken' ? '✓ Logged as taken' : 'Marked skipped')
        setTimeout(() => setFlash(null), 2000)
        router.refresh()
      } else {
        const j = await res.json().catch(() => ({}))
        setFlash(j.error ?? 'Failed')
        setTimeout(() => setFlash(null), 2500)
      }
    } finally {
      setBusy(null)
    }
  }

  async function archive() {
    if (!confirm(`Archive ${med.name}? Its history is kept.`)) return
    setBusy('archive')
    try {
      const res = await fetch(`/api/medications/${med.id}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => logDose('taken')} disabled={!!busy}
          className="flex-1 rounded-xl bg-brand-900 hover:bg-brand-700 text-white text-sm font-semibold py-2 transition-colors disabled:opacity-60">
          {busy === 'taken' ? '…' : '✓ Take'}
        </button>
        <button onClick={() => logDose('skipped')} disabled={!!busy}
          className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2 transition-colors disabled:opacity-60">
          {busy === 'skipped' ? '…' : 'Skip'}
        </button>
        <button onClick={() => setEditing(true)} disabled={!!busy} aria-label="Edit medication"
          className="rounded-xl px-3 py-2 text-gray-400 hover:bg-brand-50 hover:text-brand-900 transition-colors disabled:opacity-60">
          ✏️
        </button>
        <button onClick={archive} disabled={!!busy} aria-label="Archive medication"
          className="rounded-xl px-3 py-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-60">
          🗑
        </button>
      </div>
      {flash && <span className="text-xs text-gray-500">{flash}</span>}

      <MedicationForm open={editing} onClose={() => setEditing(false)} mode="edit" initial={med} />
    </>
  )
}
