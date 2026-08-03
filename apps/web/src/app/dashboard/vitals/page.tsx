import { createServerClient } from '@/lib/supabase'
import { classifyBP } from '@vitatrack/shared'
import type { Vital, VitalType } from '@vitatrack/shared'
import VitalsTable from '@/components/VitalsTable'
import VitalsTrendChart from '@/components/VitalsTrendChart'
import AddVitalButton from '@/components/vitals/AddVitalButton'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vitals — VitaTrack' }
export const revalidate = 60

const TYPE_LABELS: Record<VitalType, string> = {
  blood_pressure: '❤️ Blood Pressure',
  glucose:        '🩸 Glucose',
  weight:         '⚖️ Weight',
  temperature:    '🌡️ Temperature',
  spo2:           '💨 SpO2',
  heart_rate:     '💓 Heart Rate',
}

export default async function VitalsPage({
  searchParams,
}: {
  searchParams: { type?: string; days?: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Resolve target profile (caregiver or self)
  let targetProfileId = user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle()
  if (membership) targetProfileId = (membership as any).owner_id

  const activeType = (searchParams.type ?? 'blood_pressure') as VitalType
  const days = parseInt(searchParams.days ?? '30', 10)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { data: vitals } = await supabase
    .from('vitals')
    .select('*')
    .eq('profile_id', targetProfileId)
    .eq('type', activeType)
    .gte('recorded_at', cutoff.toISOString())
    .order('recorded_at', { ascending: false })
    .limit(200)

  const items = (vitals ?? []) as Vital[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-gray-900">Vitals History</h1>
        <div className="flex items-center gap-2">
          <a href={`/dashboard/scan?artifact=device_screen&vitalType=${activeType}`} className="btn-secondary text-sm whitespace-nowrap">📷 Scan device</a>
          <AddVitalButton defaultType={activeType} />
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(TYPE_LABELS) as [VitalType, string][]).map(([type, label]) => (
          <a
            key={type}
            href={`/dashboard/vitals?type=${type}&days=${days}`}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              activeType === type
                ? 'bg-brand-900 text-white border-brand-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Range selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 font-medium">Range:</span>
        {[
          { d: 7,   label: '7 days' },
          { d: 30,  label: '30 days' },
          { d: 90,  label: '90 days' },
          { d: 365, label: '1 year' },
        ].map(({ d, label }) => (
          <a
            key={d}
            href={`/dashboard/vitals?type=${activeType}&days=${d}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              days === d
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Stats summary */}
      {items.length > 0 && activeType === 'blood_pressure' && (
        <BPSummary vitals={items} />
      )}

      {/* Trend chart */}
      {items.length > 0 && (
        <VitalsTrendChart vitals={items} type={activeType} />
      )}

      {/* Table */}
      <div className="card p-5">
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
          {items.length} reading{items.length !== 1 ? 's' : ''} · {TYPE_LABELS[activeType]}
        </p>
        <VitalsTable vitals={items} />
      </div>
    </div>
  )
}

function BPSummary({ vitals }: { vitals: Vital[] }) {
  const bpVitals = vitals.filter(v => v.systolic && v.diastolic)
  if (!bpVitals.length) return null

  const avgSys  = Math.round(bpVitals.reduce((s, v) => s + (v.systolic ?? 0), 0) / bpVitals.length)
  const avgDia  = Math.round(bpVitals.reduce((s, v) => s + (v.diastolic ?? 0), 0) / bpVitals.length)
  const minSys  = Math.min(...bpVitals.map(v => v.systolic ?? 999))
  const maxSys  = Math.max(...bpVitals.map(v => v.systolic ?? 0))
  const cls     = classifyBP(avgSys, avgDia)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Average',    value: `${avgSys}/${avgDia}`, unit: 'mmHg', badge: cls },
        { label: 'Min Systolic', value: `${minSys}`,          unit: 'mmHg', badge: null },
        { label: 'Max Systolic', value: `${maxSys}`,          unit: 'mmHg', badge: null },
        { label: 'Readings',     value: `${bpVitals.length}`, unit: 'total', badge: null },
      ].map(({ label, value, unit, badge }) => (
        <div key={label} className="card p-4">
          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-xl font-black text-gray-900">{value}</p>
          <p className="text-xs text-gray-400">{unit}</p>
          {badge && (
            <span
              className="badge text-xs mt-1 px-2 py-0.5"
              style={{ backgroundColor: badge.bgColor, color: badge.color }}
            >
              {badge.label}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
