import { createServerClient } from '@/lib/supabase'
import type { Vital, VitalType } from '@vitatrack/shared'
import VitalsView from '@/components/vitals/VitalsView'
import VitalsClient from '@/components/vitals/VitalsClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vitals — VitaTrack' }
export const revalidate = 60

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function VitalsPage({
  searchParams,
}: {
  searchParams: { type?: string; days?: string }
}) {
  const activeType = (searchParams.type ?? 'blood_pressure') as VitalType
  const days = parseInt(searchParams.days ?? '30', 10)

  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) {
    return <VitalsClient activeType={activeType} days={days} />
  }

  // ── Flag off: server-side render (existing behaviour, now via the shared view). ──
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  let targetProfileId = user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', user.id)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle()
  if (membership) targetProfileId = (membership as any).owner_id

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

  return <VitalsView items={(vitals ?? []) as Vital[]} activeType={activeType} days={days} />
}
