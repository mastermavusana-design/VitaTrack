import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import ChildDetailView from '@/components/children/ChildDetailView'
import ChildDetailClient from '@/components/children/ChildDetailClient'

export const metadata: Metadata = { title: 'Child — VitaTrack' }
export const dynamic = 'force-dynamic'

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function ChildDetailPage({ params }: { params: { id: string } }) {
  // ── R1 Phase B: client-direct read (flagged; PHI read stays in af-south-1). ──
  if (CLIENT_DIRECT) return <ChildDetailClient id={params.id} />

  // ── Flag off: server-side render. RLS restricts rows to visible children. ──
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: dependant } = await supabase
    .from('dependants').select('*').eq('id', params.id).maybeSingle()
  if (!dependant) return <ChildDetailView dependant={null} immunisations={[]} measurements={[]} milestones={[]} />

  const [{ data: imm }, { data: growth }, { data: mil }] = await Promise.all([
    supabase.from('immunisations').select('*').eq('dependant_id', params.id).order('due_date', { ascending: true }),
    supabase.from('growth_measurements').select('*').eq('dependant_id', params.id).order('measured_at', { ascending: true }),
    supabase.from('milestones').select('*').eq('dependant_id', params.id).order('created_at', { ascending: true }),
  ])

  return (
    <ChildDetailView
      dependant={dependant as any}
      immunisations={imm ?? []}
      measurements={growth ?? []}
      milestones={mil ?? []}
    />
  )
}
