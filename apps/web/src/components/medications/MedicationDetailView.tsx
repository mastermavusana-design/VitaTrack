import { calcAdherence, formatDate, formatTime } from '@vitatrack/shared'
import type { DoseLog, DoseStatus } from '@vitatrack/shared'
import MedCardActions from '@/components/medications/MedCardActions'

const STATUS_STYLE: Record<DoseStatus, { dot: string; label: string }> = {
  taken:   { dot: '#059669', label: 'Taken' },
  missed:  { dot: '#dc2626', label: 'Missed' },
  skipped: { dot: '#9ca3af', label: 'Skipped' },
  pending: { dot: '#d97706', label: 'Pending' },
}

/**
 * Presentational medication detail. Fed by either the SSR read (flag off) or the
 * client-direct read wrapper (flag on).
 */
export default function MedicationDetailView({
  med,
  history,
  notice,
}: {
  med: any | null
  history: any[]
  notice?: string | null
}) {
  if (!med) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="card p-10 text-center text-gray-400">
          <span className="text-4xl">💊</span>
          <p className="mt-2">Medication not found.</p>
        </div>
      </div>
    )
  }

  const logs = history as DoseLog[]
  const adh = calcAdherence(logs)
  const sched = med.schedules?.[0]
  const isLow =
    med.pill_count !== null && med.refill_threshold !== null && med.pill_count <= med.refill_threshold
  const subtitle = [
    med.strength ? `${med.strength}${med.strength_unit ?? ''}` : null,
    med.form,
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-6">
      <BackLink />

      {notice && (
        <div className="rounded-xl bg-amber-50 text-amber-700 text-sm px-4 py-2 border border-amber-100">{notice}</div>
      )}

      {/* Hero */}
      <div className="card overflow-hidden flex">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: med.color ?? '#1A569B' }} />
        <div className="p-5 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-gray-900">{med.name}</h1>
              {!!subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <span
              className={`badge shrink-0 ${
                med.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {med.is_active ? '● Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Adherence */}
      {logs.length > 0 && (
        <Section title="Adherence · last 30 days">
          <div className="flex items-center gap-4">
            <span className="text-3xl font-black" style={{ color: adh.color }}>{adh.rate}%</span>
            <div className="flex-1">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${adh.rate}%`, backgroundColor: adh.color }} />
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                {adh.taken}/{adh.total} taken · {adh.streak}-day streak · {adh.label}
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* Supply */}
      {med.pill_count !== null && (
        <Section title="Supply">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-gray-900">
              {med.pill_count} <span className="text-sm font-medium text-gray-400">left</span>
            </span>
            {isLow && <span className="badge bg-red-100 text-red-600">Low — refill soon</span>}
          </div>
          {med.refill_threshold !== null && (
            <p className="text-xs text-gray-500 mt-1">Refill reminder at {med.refill_threshold} remaining</p>
          )}
        </Section>
      )}

      {/* Schedule */}
      <Section title="Schedule">
        {sched ? (
          <div className="space-y-1">
            <p className="text-gray-900 font-medium capitalize">{String(sched.frequency).replace(/_/g, ' ')}</p>
            {sched.times?.length ? <p className="text-xs text-gray-500">Times: {sched.times.join(', ')}</p> : null}
            <p className="text-xs text-gray-500">
              {sched.reminder_enabled
                ? `Reminders on${sched.reminder_minutes_before ? ` · ${sched.reminder_minutes_before} min before` : ''}`
                : 'Reminders off'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No schedule set</p>
        )}
      </Section>

      {/* Details */}
      <Section title="Details">
        <dl className="divide-y divide-gray-100">
          <DetailRow label="Generic name" value={med.generic_name} />
          <DetailRow label="Prescriber" value={med.prescriber} />
          <DetailRow label="Instructions" value={med.instructions} />
          <DetailRow label="Start date" value={med.start_date ? formatDate(med.start_date) : null} />
          <DetailRow label="End date" value={med.end_date ? formatDate(med.end_date) : null} />
        </dl>
        {!med.generic_name && !med.prescriber && !med.instructions &&
          !med.start_date && !med.end_date && (
            <p className="text-xs text-gray-400">No extra details recorded.</p>
          )}
      </Section>

      {/* Recent doses */}
      {logs.length > 0 && (
        <Section title="Recent doses">
          <ul className="divide-y divide-gray-100">
            {logs.slice(0, 12).map((h) => {
              const st = STATUS_STYLE[h.status] ?? STATUS_STYLE.pending
              return (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-xs" style={{ color: st.dot }}>●</span>
                  <span className="text-sm font-medium text-gray-700 w-20">{st.label}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatDate(h.logged_at)} · {formatTime(h.logged_at)}
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {/* Actions (Take / Skip / edit / archive) */}
      <div className="card p-5">
        <MedCardActions med={med} />
      </div>
    </div>
  )
}

/* ─── Pieces ─── */
function BackLink() {
  return (
    <a href="/dashboard/medications" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-900 transition-colors">
      ‹ Back to medications
    </a>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">{title}</h2>
      <div className="card p-5">{children}</div>
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-700 text-right">{value}</dd>
    </div>
  )
}
