'use client'

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import type { AdherenceDay } from '@/lib/dashboardAnalytics'

const GRID = 'rgba(148,163,184,0.18)'
const TICK = '#94A3B8'

function TT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d: AdherenceDay = payload[0].payload
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5 text-sm">
      <p className="font-bold text-gray-700 dark:text-slate-200 mb-1">{label}</p>
      <p className="font-black" style={{ color: '#16A34A' }}>{d.rate}% adherence</p>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
        {d.taken} taken · {d.missed} missed · {d.skipped} skipped
      </p>
    </div>
  )
}

export default function AdherenceArea({ data }: { data: AdherenceDay[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="adh" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label" tick={{ fontSize: 10, fill: TICK }} tickLine={false} axisLine={false}
          interval={Math.max(0, Math.floor(data.length / 6))} minTickGap={12}
        />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: TICK }} tickLine={false} axisLine={false} width={38} unit="%" />
        <Tooltip content={<TT />} cursor={{ stroke: GRID }} />
        <ReferenceLine y={80} stroke="#16A34A" strokeDasharray="4 4" strokeOpacity={0.5} />
        <Area type="monotone" dataKey="rate" stroke="#10B981" strokeWidth={2.5} fill="url(#adh)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
