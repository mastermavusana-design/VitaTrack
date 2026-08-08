'use client'

import { useEffect, useState } from 'react'
import { cachedSelect } from '@/lib/dataStore'
import ChildDetailView from './ChildDetailView'

/**
 * Client-direct child-detail read (R1 Phase B). Fetches the dependant plus its
 * immunisations, growth measurements and milestones from the af-south-1 Data API
 * under RLS (visible children only), with an offline read-cache fallback.
 */
export default function ChildDetailClient({ id }: { id: string }) {
  const [state, setState] = useState<{
    dependant: any | null
    immunisations: any[]; measurements: any[]; milestones: any[]
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [dep, imm, growth, mil] = await Promise.all([
        cachedSelect<any>(`dependant:${id}`, (sb) =>
          sb.from('dependants').select('*').eq('id', id).limit(1)),
        cachedSelect<any>(`immunisations:${id}`, (sb) =>
          sb.from('immunisations').select('*').eq('dependant_id', id).order('due_date', { ascending: true })),
        cachedSelect<any>(`growth:${id}`, (sb) =>
          sb.from('growth_measurements').select('*').eq('dependant_id', id).order('measured_at', { ascending: true })),
        cachedSelect<any>(`milestones:${id}`, (sb) =>
          sb.from('milestones').select('*').eq('dependant_id', id).order('created_at', { ascending: true })),
      ])
      if (cancelled) return
      setState({
        dependant: dep.rows[0] ?? null,
        immunisations: imm.rows, measurements: growth.rows, milestones: mil.rows,
      })
      const fromCache = [dep, imm, growth, mil].some((r) => r.fromCache)
      setNotice(fromCache ? 'Showing saved data — you appear to be offline.' : null)
    })()
    return () => { cancelled = true }
  }, [id])

  if (state === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <ChildDetailView
      dependant={state.dependant}
      immunisations={state.immunisations}
      measurements={state.measurements}
      milestones={state.milestones}
      notice={notice}
    />
  )
}
