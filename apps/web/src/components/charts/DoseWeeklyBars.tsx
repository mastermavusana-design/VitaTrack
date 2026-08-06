'use client'

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { WeekBreakdown } from '@/lib/dashboardAnalytics'

const GRID = 'rgba(148,163,184,0.18)'
const TICK = '#94A3B8'
const COLORS = { taken: '#10B981', missed: '#EF4444', skipped: '#F59E0B' }

function TT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5 text-sm">
      <p className="font-bold text-gray-700 dark:text-slate-200 mb-1">Week of {label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="font-semibold capitalize" style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

export default function DoseWeeklyBars({ data }: { data: WeekBreakdown[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }} barCategoryGap="26%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: TICK }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: TICK }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
        <Tooltip content={<TT />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
        <Bar dataKey="taken" stackId="a" fill={COLORS.taken} radius={[0, 0, 0, 0]} maxBarSize={38} />
        <Bar dataKey="skipped" stackId="a" fill={COLORS.skipped} maxBarSize={38} />
        <Bar dataKey="missed" stackId="a" fill={COLORS.missed} radius={[4, 4, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  )
}
