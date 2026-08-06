import { classifyBP, classifyGlucose, formatDate } from '@vitatrack/shared'
import type { Vital, DoseLog } from '@vitatrack/shared'
import VitalsTable from '@/components/VitalsTable'
import StatCard from '@/components/charts/StatCard'
import AdherenceRing from '@/components/charts/AdherenceRing'
import AdherenceArea from '@/components/charts/AdherenceArea'
import DoseWeeklyBars from '@/components/charts/DoseWeeklyBars'
import TrendChart from '@/components/charts/TrendChart'
import Sparkline from '@/components/charts/Sparkline'
import {
  vitalSeries, sparkValues, latestDelta,
  adherenceSummary, adherenceDaily, adherenceWeekly, perMedAdherence, readingsPerDay,
} from '@/lib/dashboardAnalytics'

/* Small inline metric glyphs for the KPI cards. */
const Glyph = {
  heart: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>),
  drop: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3Z"/></svg>),
  scale: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21h16M12 3v18M7 7h10l3 8a5 5 0 0 1-16 0Z"/></svg>),
  pulse: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>),
  lungs: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v8M8 9c0 3-3 4-3 8a2 2 0 0 0 4 0V9M16 9c0 3 3 4 3 8a2 2 0 0 1-4 0V9"/></svg>),
  thermo: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0Z"/></svg>),
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

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
  const vitals = recentVitals as Vital[]
  const logs = doseLogs as DoseLog[]

  const lowMeds = meds.filter(
    (m: any) => m.pill_count !== null && m.refill_threshold !== null && m.pill_count <= m.refill_threshold,
  )

  /* Adherence analytics */
  const adh = adherenceSummary(logs)
  const adhDaily = adherenceDaily(logs, 30)
  const adhWeekly = adherenceWeekly(logs, 6)
  const medAdh = perMedAdherence(logs)

  /* Vital series */
  const bp = vitalSeries(vitals, 'blood_pressure')
  const glucose = vitalSeries(vitals, 'glucose')
  const weight = vitalSeries(vitals, 'weight')
  const hr = vitalSeries(vitals, 'heart_rate')
  const spo2 = vitalSeries(vitals, 'spo2')
  const temp = vitalSeries(vitals, 'temperature')

  const bpDelta = latestDelta(bp)
  const glDelta = latestDelta(glucose)
  const wtDelta = latestDelta(weight)
  const hrDelta = latestDelta(hr)
  const spDelta = latestDelta(spo2)
  const tmDelta = latestDelta(temp)

  const latestBP = bp.length ? bp[bp.length - 1] : null
  const latestGl = glucose.length ? glucose[glucose.length - 1] : null
  const latestGlVital = vitals.find(v => v.type === 'glucose')

  const bpClass = latestBP?.value && latestBP?.secondary ? classifyBP(latestBP.value, latestBP.secondary) : null
  const glClass = latestGl?.value ? classifyGlucose(latestGl.value, latestGlVital?.meal_context ?? 'fasting') : null

  const cadence = readingsPerDay(vitals, 30)
  const totalReadings = cadence.reduce((s, d) => s + d.count, 0)

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">{greeting()}</p>
          <h1 className="text-2xl sm:text-[28px] font-black text-gray-900 tracking-tight">
            {isCaregiver ? `${ownerName}'s Health Overview` : 'My Health Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isCaregiver
              ? 'Read-only caregiver view · refreshes every 60 seconds'
              : `${formatDate(new Date().toISOString())} · your health at a glance`}
          </p>
        </div>
        {!isCaregiver && (
          <div className="flex items-center gap-2">
            <a href="/dashboard/vitals" className="btn-secondary text-sm py-2 px-4">+ Log vitals</a>
            <a href="/dashboard/medications" className="btn-primary text-sm py-2 px-4">+ Add medication</a>
          </div>
        )}
      </div>

      {notice && (
        <div className="rounded-xl bg-amber-50 text-amber-700 text-sm px-4 py-2.5 border border-amber-200 flex items-center gap-2">
          <span aria-hidden>⚠️</span>{notice}
        </div>
      )}

      {/* ── Refill alerts ── */}
      {lowMeds.length > 0 && (
        <div className="card p-4 border-amber-300 bg-amber-50">
          <p className="text-sm font-black text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-2">
            <span aria-hidden>🔔</span> Refill alerts ({lowMeds.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {lowMeds.map((m: any) => (
              <span key={m.id} className="bg-amber-200 text-amber-900 text-sm font-semibold px-3 py-1 rounded-full">
                {m.name} — {m.pill_count} left
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Blood Pressure" icon={Glyph.heart} color="#1A569B"
          value={latestBP?.value && latestBP?.secondary ? `${latestBP.value}/${latestBP.secondary}` : '—'}
          unit="mmHg"
          badge={bpClass ? { text: bpClass.label, color: bpClass.color, bg: bpClass.bgColor } : null}
          delta={bpDelta.delta} spark={sparkValues(bp)}
          time={latestBP ? formatDate(latestBP.t) : undefined}
        />
        <StatCard
          label="Glucose" icon={Glyph.drop} color="#8B5CF6"
          value={latestGl?.value != null ? latestGl.value.toFixed(1) : '—'}
          unit={latestGlVital?.glucose_unit ?? 'mmol/L'}
          badge={glClass ? { text: glClass.label, color: glClass.color, bg: glClass.bgColor } : null}
          delta={glDelta.delta} spark={sparkValues(glucose)}
          time={latestGl ? formatDate(latestGl.t) : undefined}
        />
        <StatCard
          label="Weight" icon={Glyph.scale} color="#0EA5E9"
          value={wtDelta.latest != null ? String(wtDelta.latest) : '—'}
          unit={(vitals.find(v => v.type === 'weight') as any)?.weight_unit ?? 'kg'}
          delta={wtDelta.delta} spark={sparkValues(weight)}
          time={weight.length ? formatDate(weight[weight.length - 1].t) : undefined}
        />
        <StatCard
          label="Heart Rate" icon={Glyph.pulse} color="#EF4444"
          value={hrDelta.latest != null ? String(hrDelta.latest) : '—'}
          unit="bpm"
          delta={hrDelta.delta} spark={sparkValues(hr)}
          time={hr.length ? formatDate(hr[hr.length - 1].t) : undefined}
        />
        {spo2.length > 0 && (
          <StatCard
            label="Oxygen (SpO₂)" icon={Glyph.lungs} color="#06B6D4"
            value={spDelta.latest != null ? String(spDelta.latest) : '—'} unit="%"
            delta={spDelta.delta} spark={sparkValues(spo2)}
            time={formatDate(spo2[spo2.length - 1].t)}
          />
        )}
        {temp.length > 0 && (
          <StatCard
            label="Temperature" icon={Glyph.thermo} color="#F59E0B"
            value={tmDelta.latest != null ? tmDelta.latest.toFixed(1) : '—'} unit="°C"
            delta={tmDelta.delta} spark={sparkValues(temp)}
            time={formatDate(temp[temp.length - 1].t)}
          />
        )}
      </div>

      {/* ── Adherence: ring + 30-day trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6 flex flex-col items-center text-center">
          <h2 className="self-start text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">
            28-Day Adherence
          </h2>
          <AdherenceRing rate={adh.rate} color={adh.color} label={adh.label} caption={`${adh.streak}-day streak`} />
          <div className="grid grid-cols-3 gap-2 w-full mt-6">
            <Stat mini label="Taken" value={adh.taken} color="#10B981" />
            <Stat mini label="Missed" value={adh.missed} color="#EF4444" />
            <Stat mini label="Skipped" value={adh.skipped} color="#F59E0B" />
          </div>
        </div>

        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
              Adherence Trend — last 30 days
            </h2>
            <span className="text-xs text-gray-400">Target 80%</span>
          </div>
          <AdherenceArea data={adhDaily} />
        </div>
      </div>

      {/* ── Weekly dose breakdown + medications ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">
            Doses by Week
          </h2>
          <DoseWeeklyBars data={adhWeekly} />
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
              Medications ({meds.length})
            </h2>
            <a href="/dashboard/medications" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all →</a>
          </div>
          <div className="space-y-3">
            {meds.slice(0, 6).map((m: any) => {
              const a = medAdh.get(m.id)
              const rate = a?.rate ?? null
              const low = m.pill_count !== null && m.pill_count <= (m.refill_threshold ?? 7)
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color ?? '#1A569B' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-gray-900 truncate">
                        {m.name}
                        {m.strength && <span className="text-gray-400 font-normal"> · {m.strength}{m.strength_unit}</span>}
                      </p>
                      <span className="text-xs font-bold text-gray-500 shrink-0">{rate != null ? `${rate}%` : '—'}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${rate ?? 0}%`, backgroundColor: rate == null ? '#E5E7EB' : rate >= 80 ? '#10B981' : rate >= 60 ? '#F59E0B' : '#EF4444' }}
                      />
                    </div>
                  </div>
                  {m.pill_count !== null && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${low ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                      {m.pill_count} left
                    </span>
                  )}
                </div>
              )
            })}
            {meds.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400 mb-3">No active medications yet.</p>
                <a href="/dashboard/medications" className="btn-secondary text-sm py-2 px-4 inline-block">+ Add your first medication</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Vitals trends: BP + Glucose ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">
            Blood Pressure Trend
          </h2>
          <TrendChart
            data={bp}
            config={{
              unit: 'mmHg', primaryName: 'Systolic', primaryColor: '#1A569B',
              secondaryName: 'Diastolic', secondaryColor: '#60A5FA',
              bands: [{ y1: 90, y2: 120, color: '#10B981' }],
              refLines: [{ y: 130, color: '#F59E0B' }, { y: 140, color: '#EF4444' }],
            }}
          />
        </div>
        <div className="card p-6">
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">
            Glucose Trend
          </h2>
          <TrendChart
            data={glucose}
            config={{
              unit: latestGlVital?.glucose_unit ?? 'mmol/L', primaryName: 'Glucose', primaryColor: '#8B5CF6',
              bands: [{ y1: 4, y2: 7, color: '#10B981' }],
              refLines: [{ y: 3.9, color: '#EF4444' }],
            }}
          />
        </div>
      </div>

      {/* ── Weight trend + reading cadence ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6 lg:col-span-2">
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">
            Weight Trend
          </h2>
          <TrendChart
            data={weight}
            config={{ unit: (vitals.find(v => v.type === 'weight') as any)?.weight_unit ?? 'kg', primaryName: 'Weight', primaryColor: '#0EA5E9', height: 220 }}
          />
        </div>
        <div className="card p-6 flex flex-col">
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Logging Activity
          </h2>
          <p className="text-3xl font-black text-gray-900">{totalReadings}</p>
          <p className="text-xs text-gray-400 mb-4">readings in the last 30 days</p>
          <div className="mt-auto">
            <Sparkline values={cadence.map(c => c.count)} color="#1A569B" width={260} height={54} />
            <div className="flex justify-between text-[11px] text-gray-300 mt-1">
              <span>30 days ago</span><span>Today</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent vitals table ── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Recent Vitals</h2>
          <a href="/dashboard/vitals" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all →</a>
        </div>
        <VitalsTable vitals={vitals.slice(0, 12)} />
      </div>

    </div>
  )
}

function Stat({ label, value, color, mini }: { label: string; value: number; color: string; mini?: boolean }) {
  return (
    <div className={`rounded-xl bg-gray-50 ${mini ? 'py-2.5' : 'p-3'} flex flex-col items-center`}>
      <span className="text-lg font-black" style={{ color }}>{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
    </div>
  )
}
