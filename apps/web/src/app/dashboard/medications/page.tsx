import { createServerClient } from '@/lib/supabase'
import { calcAdherence } from '@vitatrack/shared'
import type { DoseLog } from '@vitatrack/shared'
import type { Metadata } from 'next'
import AddMedicationButton from '@/components/medications/AddMedicationButton'
import MedCardActions from '@/components/medications/MedCardActions'

export const metadata: Metadata = { title: 'Medications — VitaTrack' }
export const revalidate = 60

export default async function MedicationsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Resolve target profile
  let targetProfileId = user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle()
  if (membership) targetProfileId = (membership as any).owner_id

  const cutoff30 = new Date()
  cutoff30.setDate(cutoff30.getDate() - 30)

  const [{ data: meds }, { data: doseLogs }] = await Promise.all([
    supabase
      .from('medications')
      .select('*, schedules:medication_schedules(*)')
      .eq('profile_id', targetProfileId)
      .order('is_active', { ascending: false })
      .order('name'),

    supabase
      .from('dose_logs')
      .select('*')
      .eq('profile_id', targetProfileId)
      .gte('logged_at', cutoff30.toISOString())
      .order('logged_at', { ascending: false }),
  ])

  const allMeds  = meds ?? []
  const activeMeds   = allMeds.filter((m: any) => m.is_active)
  const inactiveMeds = allMeds.filter((m: any) => !m.is_active)

  // Per-medication adherence: filter logs to that medication
  const adherenceByMed = new Map<string, ReturnType<typeof calcAdherence>>()
  for (const med of activeMeds) {
    const medLogs = (doseLogs ?? []).filter((l: any) => l.medication_id === med.id)
    adherenceByMed.set(med.id, calcAdherence(medLogs as DoseLog[]))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900">Medications</h1>
        <div className="flex items-center gap-2">
          <a href="/dashboard/scan?artifact=medication" className="btn-secondary text-sm whitespace-nowrap">📷 Scan barcode</a>
          <AddMedicationButton />
        </div>
      </div>

      {/* Active medications */}
      <section>
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
          Active ({activeMeds.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeMeds.map((med: any) => {
            const adh = adherenceByMed.get(med.id)
            const isLow = med.pill_count !== null && med.refill_threshold !== null
              && med.pill_count <= med.refill_threshold

            return (
              <div key={med.id} className="card p-5 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div
                    className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: med.color ?? '#1A569B' }}
                  />
                  <div className="flex-1 min-w-0">
                    <a href={`/dashboard/medications/${med.id}`} className="font-black text-gray-900 hover:text-brand-900 transition-colors">
                      {med.name}
                    </a>
                    {med.generic_name && (
                      <p className="text-xs text-gray-400">{med.generic_name}</p>
                    )}
                    {med.strength && (
                      <p className="text-sm text-gray-500">
                        {med.strength}{med.strength_unit} · {med.form}
                      </p>
                    )}
                  </div>
                  {isLow && (
                    <span className="badge bg-red-100 text-red-600 text-xs shrink-0">
                      ⚠️ Refill
                    </span>
                  )}
                </div>

                {/* Schedules */}
                {med.schedules?.length > 0 && (
                  <div className="text-xs text-gray-500 flex flex-wrap gap-1">
                    {med.schedules.map((s: any, i: number) => (
                      <span key={i} className="bg-gray-100 rounded-full px-2.5 py-1">
                        {s.frequency?.replace('_', ' ')} · {s.times?.join(', ')}
                      </span>
                    ))}
                  </div>
                )}

                {/* Adherence bar */}
                {adh && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">30-day adherence</span>
                      <span className="text-xs font-bold" style={{ color: adh.color }}>
                        {adh.rate}% · {adh.label}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${adh.rate}%`, backgroundColor: adh.color }}
                      />
                    </div>
                  </div>
                )}

                {/* Pill count */}
                {med.pill_count !== null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Remaining</span>
                    <span className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-700'}`}>
                      {med.pill_count} tablet{med.pill_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {/* Instructions */}
                {med.instructions && (
                  <p className="text-xs text-gray-400 italic">{med.instructions}</p>
                )}

                {/* Dose logging + edit + archive */}
                <MedCardActions med={med} />
              </div>
            )
          })}

          {activeMeds.length === 0 && (
            <div className="col-span-2 text-center py-12 text-gray-400">
              <span className="text-4xl">💊</span>
              <p className="mt-2">No active medications</p>
            </div>
          )}
        </div>
      </section>

      {/* Inactive / archived medications */}
      {inactiveMeds.length > 0 && (
        <section>
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
            Inactive / Archived ({inactiveMeds.length})
          </h2>
          <div className="card divide-y divide-gray-100">
            {inactiveMeds.map((med: any) => (
              <div key={med.id} className="flex items-center gap-3 px-5 py-3 opacity-60">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: med.color ?? '#9CA3AF' }}
                />
                <a href={`/dashboard/medications/${med.id}`} className="text-sm font-medium text-gray-600 line-through flex-1 hover:text-brand-900 hover:no-underline transition-colors">{med.name}</a>
                {med.strength && (
                  <p className="text-xs text-gray-400">{med.strength}{med.strength_unit}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
