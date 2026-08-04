import { classifyBP, classifyGlucose, calcAdherence, formatDate } from '@vitatrack/shared'
import type { Vital, DoseLog } from '@vitatrack/shared'
import AdherenceChart from '@/components/AdherenceChart'
import VitalsTable from '@/components/VitalsTable'

/**
 * Presentational dashboard home. Fed by either the SSR read (flag off) or the
 * client-direct read wrapper (flag on).
 */
export default function DashboardHomeView({
  meds,
  recentVitals,
  doseLogs,
  isCaregiver,
  ownerName,
  notice,
}: {
  meds: any[]
  recentVitals: any[]
  doseLogs: any[]
  isCaregiver: boolean
  ownerName: string
  notice?: string | null
}) {
  const lowMeds = meds.filter(
    (m: any) => m.pill_count !== null && m.refill_threshold !== null && m.pill_count <= m.refill_threshold,
  )

  const adherence = calcAdherence(doseLogs as DoseLog[])

  const latestBP      = recentVitals.find((v: any) => v.type === 'blood_pressure')
  const latestGlucose = recentVitals.find((v: any) => v.type === 'glucose')
  const latestWeight  = recentVitals.find((v: any) => v.type === 'weight')

  const bpClass = latestBP?.systolic && latestBP?.diastolic
    ? classifyBP(latestBP.systolic, latestBP.diastolic) : null
  const glClass = latestGlucose?.glucose_value
    ? classifyGlucose(latestGlucose.glucose_value, latestGlucose.meal_context ?? 'fasting') : null

  return (
    <div className="space-y-6">

      {/* Welcome banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">
            {isCaregiver ? `${ownerName}'s Health Overview` : 'My Health Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isCaregiver
              ? 'Read-only caregiver view · Data updates every 60 seconds'
              : 'Your personal health summary'}
          </p>
        </div>
        {isCaregiver && (
          <span className="badge bg-blue-100 text-blue-700 text-sm px-3 py-1">
            Caregiver View
          </span>
        )}
      </div>

      {notice && (
        <div className="rounded-xl bg-amber-50 text-amber-700 text-sm px-4 py-2 border border-amber-100">{notice}</div>
      )}

      {/* Refill alerts */}
      {lowMeds.length > 0 && (
        <div className="card p-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-black text-amber-700 uppercase tracking-wide mb-2">
            Refill Alerts ({lowMeds.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {lowMeds.map((m: any) => (
              <span key={m.id} className="bg-amber-200 text-amber-800 text-sm font-semibold px-3 py-1 rounded-full">
                {m.name} — {m.pill_count} left
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Vitals row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <VitalCard
          icon="Heart"
          label="Blood Pressure"
          value={latestBP ? `${latestBP.systolic}/${latestBP.diastolic}` : '—'}
          unit="mmHg"
          sub={latestBP?.pulse ? `Pulse ${latestBP.pulse} bpm` : undefined}
          badge={bpClass ? { text: bpClass.label, color: bpClass.color, bg: bpClass.bgColor } : undefined}
          time={latestBP?.recorded_at}
        />
        <VitalCard
          icon="Glucose"
          label="Glucose"
          value={latestGlucose?.glucose_value?.toFixed(1) ?? '—'}
          unit={latestGlucose?.glucose_unit ?? 'mmol/L'}
          sub={latestGlucose?.meal_context?.replace('_', ' ')}
          badge={glClass ? { text: glClass.label, color: glClass.color, bg: glClass.bgColor } : undefined}
          time={latestGlucose?.recorded_at}
        />
        <VitalCard
          icon="Weight"
          label="Weight"
          value={latestWeight?.weight_value?.toString() ?? '—'}
          unit={latestWeight?.weight_unit ?? 'kg'}
          time={latestWeight?.recorded_at}
        />
      </div>

      {/* Adherence + medications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Adherence summary */}
        <div className="card p-5">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
            90-Day Adherence
          </h2>
          <div className="flex items-end gap-4 mb-4">
            <span className="text-5xl font-black" style={{ color: adherence.color }}>
              {adherence.rate}%
            </span>
            <div>
              <span
                className="badge text-sm px-3 py-1"
                style={{ backgroundColor: adherence.color + '22', color: adherence.color }}
              >
                {adherence.label}
              </span>
              <p className="text-xs text-gray-400 mt-1">
                {adherence.streak}-day streak
              </p>
            </div>
          </div>
          <AdherenceChart logs={doseLogs as DoseLog[]} />
        </div>

        {/* Active medications */}
        <div className="card p-5">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
            Active Medications ({meds.length})
          </h2>
          <div className="space-y-2">
            {meds.slice(0, 8).map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: m.color ?? '#1A569B' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{m.name}</p>
                  {m.strength && (
                    <p className="text-xs text-gray-400">{m.strength}{m.strength_unit} · {m.form}</p>
                  )}
                </div>
                {m.pill_count !== null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    m.pill_count <= (m.refill_threshold ?? 7)
                      ? 'bg-red-100 text-red-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {m.pill_count} left
                  </span>
                )}
              </div>
            ))}
            {meds.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No active medications</p>
            )}
          </div>
        </div>
      </div>

      {/* Vitals history table */}
      <div className="card p-5">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
          Recent Vitals
        </h2>
        <VitalsTable vitals={recentVitals.slice(0, 20) as Vital[]} />
      </div>

    </div>
  )
}

function VitalCard({
  icon: _icon, label, value, unit, sub, badge, time,
}: {
  icon: string
  label: string
  value: string
  unit: string
  sub?: string
  badge?: { text: string; color: string; bg: string }
  time?: string
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
        {label}
      </p>
      <div className="flex items-end justify-between mb-1">
        <span className="text-3xl font-black text-gray-900">{value}</span>
        {badge && (
          <span
            className="badge text-xs px-2.5 py-1"
            style={{ backgroundColor: badge.bg, color: badge.color }}
          >
            {badge.text}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500">{unit}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 capitalize">{sub}</p>}
      {time && (
        <p className="text-xs text-gray-300 mt-2">{formatDate(time)}</p>
      )}
    </div>
  )
}
