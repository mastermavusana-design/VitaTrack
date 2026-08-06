'use client'

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine,
} from 'recharts'
import type { VitalPoint } from '@/lib/dashboardAnalytics'

const GRID = 'rgba(148,163,184,0.18)'
const TICK = '#94A3B8'

export interface Band { y1: number; y2: number; color: string; label?: string }

export interface TrendConfig {
  unit: string
  primaryName: string
  primaryColor: string
  secondaryName?: string
  secondaryColor?: string
  bands?: Band[]
  refLines?: { y: number; color: string; label?: string }[]
  height?: number
}

function makeTooltip(unit: string) {
  return function TT({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5 text-sm">
        <p className="font-bold text-gray-700 dark:text-slate-200 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} className="font-semibold" style={{ color: p.color }}>
            {p.name}: {p.value != null ? `${p.value} ${unit}` : '—'}
          </p>
        ))}
      </div>
    )
  }
}

export default function TrendChart({ data, config }: { data: VitalPoint[]; config: TrendConfig }) {
  const {
    unit, primaryName, primaryColor, secondaryName, secondaryColor,
    bands = [], refLines = [], height = 240,
  } = config

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-sm" style={{ height }}>
        No readings recorded yet for this metric.
      </div>
    )
  }

  const vals = data.flatMap(d => [d.value, d.secondary]).filter((v): v is number => v != null)
  const bandVals = bands.flatMap(b => [b.y1, b.y2])
  const lo = Math.min(...vals, ...bandVals)
  const hi = Math.max(...vals, ...bandVals)
  const yMin = Math.floor(lo - (hi - lo || 10) * 0.08)
  const yMax = Math.ceil(hi + (hi - lo || 10) * 0.08)
  const hasSecondary = !!secondaryName

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        {bands.map((b, i) => (
          <ReferenceArea key={i} y1={b.y1} y2={b.y2} fill={b.color} fillOpacity={0.10} strokeOpacity={0} ifOverflow="extendDomain" />
        ))}
        {refLines.map((r, i) => (
          <ReferenceLine key={i} y={r.y} stroke={r.color} strokeDasharray="4 4" strokeOpacity={0.55} />
        ))}
        <XAxis
          dataKey="label" tick={{ fontSize: 10, fill: TICK }} tickLine={false} axisLine={false}
          interval="preserveStartEnd" minTickGap={16}
        />
        <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: TICK }} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={makeTooltip(unit)} cursor={{ stroke: GRID }} />
        {hasSecondary && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />}
        <Line
          type="monotone" dataKey="value" name={primaryName} stroke={primaryColor} strokeWidth={2.5}
          dot={{ r: 2.5, fill: primaryColor, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls
        />
        {hasSecondary && (
          <Line
            type="monotone" dataKey="secondary" name={secondaryName} stroke={secondaryColor} strokeWidth={2.5}
            dot={{ r: 2.5, fill: secondaryColor, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
