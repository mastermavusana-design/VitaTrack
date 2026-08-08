'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ageInDays } from '@vitatrack/shared'
import type {
  Dependant, Immunisation, GrowthMeasurement, Milestone,
  ImmunisationStatus, MilestoneStatus, MilestoneDomain,
} from '@vitatrack/shared'
import { CLIENT_DIRECT, queuedUpdate } from '@/lib/dataStore'
import GrowthChart, { GROWTH_INDICATORS, type IndicatorKey } from './GrowthChart'
import AddGrowthMeasurement from './AddGrowthMeasurement'
import ChildDocuments from './ChildDocuments'

interface Props {
  dependant: Dependant | null
  immunisations: Immunisation[]
  measurements: GrowthMeasurement[]
  milestones: Milestone[]
  notice?: string | null
}

type Tab = 'immunisations' | 'growth' | 'milestones' | 'documents'

const today = () => new Date().toISOString().slice(0, 10)

function formatAge(dobISO: string): string {
  const days = ageInDays(dobISO, today())
  if (days < 0) return '—'
  const totalMonths = Math.floor(days / 30.4375)
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years === 0) return `${totalMonths} mo`
  if (months === 0) return `${years} yr`
  return `${years} yr ${months} mo`
}

const IMM_BADGE: Record<ImmunisationStatus, string> = {
  due:             'bg-amber-50 text-amber-700 border-amber-100',
  given:           'bg-green-50 text-green-700 border-green-100',
  skipped:         'bg-gray-100 text-gray-500 border-gray-200',
  contraindicated: 'bg-red-50 text-red-700 border-red-100',
}
const MILE_BADGE: Record<MilestoneStatus, string> = {
  not_yet:  'bg-gray-100 text-gray-500 border-gray-200',
  achieved: 'bg-green-50 text-green-700 border-green-100',
  concern:  'bg-red-50 text-red-700 border-red-100',
}
const DOMAIN_LABEL: Record<MilestoneDomain, string> = {
  motor: 'Motor', language: 'Language', social: 'Social', cognitive: 'Cognitive',
}

/**
 * Apply a patch to a child-health row: client-direct update under RLS (flagged),
 * else the /api PATCH fallback. Returns ok + whether it was offline-queued.
 */
async function patchRow(
  table: 'immunisations' | 'milestones',
  endpoint: 'immunisations' | 'milestones',
  id: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  if (CLIENT_DIRECT) {
    const r = await queuedUpdate(table, body, { id })
    return r.ok ? { ok: true, queued: !!(r as { queued?: boolean }).queued } : { ok: false, error: r.error }
  }
  try {
    const res = await fetch(`/api/${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return { ok: true, queued: false }
    const j = await res.json().catch(() => ({}))
    return { ok: false, error: j.error ?? 'Update failed' }
  } catch {
    return { ok: false, error: 'Network error — please try again' }
  }
}

export default function ChildDetailView({ dependant, immunisations, measurements, milestones, notice }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('immunisations')
  const [indicator, setIndicator] = useState<IndicatorKey>('wfa')

  // Local, optimistically-updated copies (resync when the parent passes new data).
  const [imms, setImms] = useState<Immunisation[]>(immunisations)
  const [miles, setMiles] = useState<Milestone[]>(milestones)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  useEffect(() => { setImms(immunisations) }, [immunisations])
  useEffect(() => { setMiles(milestones) }, [milestones])

  if (!dependant) {
    return (
      <div className="space-y-4">
        <a href="/dashboard/children" className="text-sm text-brand-900 font-semibold">← Children</a>
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-gray-500">
          This child could not be found, or you don&apos;t have access.
        </div>
      </div>
    )
  }

  function toast(msg: string) { setFlash(msg); setTimeout(() => setFlash(null), 2200) }

  async function updateImm(id: string, patch: Partial<Immunisation> & Record<string, unknown>) {
    setBusyId(id)
    const res = await patchRow('immunisations', 'immunisations', id, patch)
    setBusyId(null)
    if (!res.ok) { toast(res.error); return }
    setImms((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    if (!res.queued && !CLIENT_DIRECT) router.refresh()
  }

  async function updateMile(id: string, patch: Partial<Milestone> & Record<string, unknown>) {
    setBusyId(id)
    const res = await patchRow('milestones', 'milestones', id, patch)
    setBusyId(null)
    if (!res.ok) { toast(res.error); return }
    setMiles((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    if (!res.queued && !CLIENT_DIRECT) router.refresh()
  }

  const dueCount = imms.filter((i) => i.status === 'due').length
  const givenCount = imms.filter((i) => i.status === 'given').length

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'immunisations', label: 'Immunisations', count: imms.length },
    { key: 'growth', label: 'Growth', count: measurements.length },
    { key: 'milestones', label: 'Milestones', count: miles.length },
    { key: 'documents', label: 'Documents' },
  ]

  return (
    <div className="space-y-6">
      <a href="/dashboard/children" className="text-sm text-brand-900 font-semibold">← Children</a>

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-900 flex items-center justify-center font-bold text-xl shrink-0">
          {dependant.full_name.trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{dependant.full_name}</h1>
          <p className="text-sm text-gray-500">
            {formatAge(dependant.date_of_birth)}
            {dependant.sex ? ` · ${dependant.sex === 'male' ? 'Boy' : 'Girl'}` : ''}
            {dependant.rthb_number ? ` · RtHB ${dependant.rthb_number}` : ''}
          </p>
        </div>
      </div>

      {(notice || flash) && (
        <div className="rounded-xl bg-amber-50 text-amber-800 text-sm px-4 py-3 border border-amber-100">{flash ?? notice}</div>
      )}

      <div className="flex gap-1 border-b border-gray-100">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-900 text-brand-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* ── Immunisations ── */}
      {tab === 'immunisations' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{dueCount} due · {givenCount} given</p>
          {imms.length === 0 ? (
            <Empty>No immunisations scheduled yet.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
              {imms.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{i.vaccine_name}</p>
                    <p className="text-xs text-gray-500">
                      {i.dose_label ?? '—'}{i.due_date ? ` · due ${i.due_date}` : ''}{i.given_date ? ` · given ${i.given_date}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${IMM_BADGE[i.status]}`}>{i.status}</span>
                    {i.status !== 'given' && (
                      <button disabled={busyId === i.id}
                        onClick={() => updateImm(i.id, { status: 'given', given_date: today() })}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-900 text-white hover:bg-brand-700 disabled:opacity-60">
                        {busyId === i.id ? '…' : 'Mark given'}
                      </button>
                    )}
                    {i.status === 'due' && (
                      <button disabled={busyId === i.id}
                        onClick={() => updateImm(i.id, { status: 'skipped', given_date: null })}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-60">
                        Skip
                      </button>
                    )}
                    {i.status !== 'due' && (
                      <button disabled={busyId === i.id}
                        onClick={() => updateImm(i.id, { status: 'due', given_date: null })}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-60">
                        Undo
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Growth ── */}
      {tab === 'growth' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1">
              {(Object.keys(GROWTH_INDICATORS) as IndicatorKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setIndicator(k)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                    indicator === k ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {GROWTH_INDICATORS[k].label}
                </button>
              ))}
            </div>
            <AddGrowthMeasurement dependantId={dependant.id} />
          </div>

          <GrowthChart sex={dependant.sex} dob={dependant.date_of_birth} measurements={measurements} indicator={indicator} />

          {measurements.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white text-sm">
              {[...measurements].reverse().map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-gray-500">{m.measured_at}</span>
                  <span className="text-gray-800 text-right">
                    {[m.weight_kg != null ? `${m.weight_kg} kg` : null,
                      m.length_cm != null ? `${m.length_cm} cm` : null,
                      m.head_circ_cm != null ? `HC ${m.head_circ_cm} cm` : null,
                      m.muac_cm != null ? `MUAC ${m.muac_cm} cm` : null].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Milestones ── */}
      {tab === 'milestones' && (
        <div className="space-y-3">
          {miles.length === 0 ? (
            <Empty>No milestones tracked yet.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
              {miles.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{m.milestone}</p>
                    <p className="text-xs text-gray-500">
                      {m.domain ? DOMAIN_LABEL[m.domain] : '—'}{m.expected_age_band ? ` · ${m.expected_age_band}` : ''}
                      {m.achieved_on ? ` · achieved ${m.achieved_on}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${MILE_BADGE[m.status]}`}>{m.status.replace('_', ' ')}</span>
                    <button disabled={busyId === m.id || m.status === 'achieved'}
                      onClick={() => updateMile(m.id, { status: 'achieved', achieved_on: today() })}
                      title="Mark achieved"
                      className="text-xs font-semibold px-2 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
                      ✓
                    </button>
                    <button disabled={busyId === m.id || m.status === 'concern'}
                      onClick={() => updateMile(m.id, { status: 'concern', achieved_on: null })}
                      title="Flag a concern"
                      className="text-xs font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40">
                      !
                    </button>
                    {m.status !== 'not_yet' && (
                      <button disabled={busyId === m.id}
                        onClick={() => updateMile(m.id, { status: 'not_yet', achieved_on: null })}
                        title="Reset"
                        className="text-xs font-semibold px-2 py-1 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-40">
                        ↺
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Documents ── */}
      {tab === 'documents' && <ChildDocuments dependantId={dependant.id} />}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
      {children}
    </div>
  )
}
