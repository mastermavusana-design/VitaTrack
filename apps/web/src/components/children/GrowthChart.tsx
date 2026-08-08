'use client'

/**
 * GrowthChart — plots a child's measurements against the WHO Child Growth
 * Standards percentile curves (P3 / P15 / P50 / P85 / P97), computed on the fly
 * from the shared LMS engine + reference tables (S1/S2). Age-based indicators
 * only (weight / length-height / head-circumference for age); x-axis is age in
 * months, 0–60.
 */

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  getLMSTable, percentileToZ, zToMeasurement, ageInDays,
  type GrowthMeasurement, type Sex,
} from '@vitatrack/shared'

export type IndicatorKey = 'wfa' | 'lhfa' | 'hcfa'

export const GROWTH_INDICATORS: Record<IndicatorKey, {
  label: string; unit: string; yLabel: string; field: keyof GrowthMeasurement
}> = {
  wfa:  { label: 'Weight-for-age',          unit: 'kg', yLabel: 'Weight (kg)',            field: 'weight_kg' },
  lhfa: { label: 'Length/height-for-age',   unit: 'cm', yLabel: 'Length / height (cm)',  field: 'length_cm' },
  hcfa: { label: 'Head circumference-for-age', unit: 'cm', yLabel: 'Head circ. (cm)',    field: 'head_circ_cm' },
}

const DAYS_PER_MONTH = 30.4375
const PERCENTILES = [3, 15, 50, 85, 97] as const

interface Props {
  sex: Sex | null
  dob: string                       // ISO date
  measurements: GrowthMeasurement[]
  indicator: IndicatorKey
}

interface Row {
  ageM: number
  P3?: number; P15?: number; P50?: number; P85?: number; P97?: number
  child?: number | null
}

export default function GrowthChart({ sex, dob, measurements, indicator }: Props) {
  const cfg = GROWTH_INDICATORS[indicator]

  if (!sex) {
    return (
      <div className="card p-5 flex items-center justify-center h-64 text-center text-sm text-gray-500">
        Set the child&apos;s sex to see the WHO percentile curves — the standards are sex-specific.
      </div>
    )
  }

  const table = getLMSTable(indicator, sex)
  if (!table) {
    return (
      <div className="card p-5 flex items-center justify-center h-64 text-gray-400 text-sm">
        Reference data unavailable for this indicator.
      </div>
    )
  }

  // Reference percentile curves at each WHO age knot (kept within 0–60 months).
  const refRows: Row[] = table.points
    .filter((p) => p.x <= 60 * DAYS_PER_MONTH + 1)
    .map((p) => {
      const row: Row = { ageM: +(p.x / DAYS_PER_MONTH).toFixed(2), child: null }
      for (const pct of PERCENTILES) {
        row[`P${pct}` as 'P50'] = +zToMeasurement(percentileToZ(pct), p).toFixed(3)
      }
      return row
    })

  // The child's own measurements for this indicator, placed on the age axis.
  const childRows: Row[] = measurements
    .map((m) => ({ m, value: m[cfg.field] as number | null }))
    .filter(({ m, value }) => value != null && m.measured_at >= dob)
    .map(({ m, value }) => ({
      ageM: +(ageInDays(dob, m.measured_at) / DAYS_PER_MONTH).toFixed(2),
      child: value as number,
    }))

  const data = [...refRows, ...childRows].sort((a, b) => a.ageM - b.ageM)

  // Y-domain: reference band + any child points, padded.
  const ys = data.flatMap((d) => [d.P3, d.P97, d.child]).filter((v): v is number => v != null)
  const yMin = ys.length ? Math.floor(Math.min(...ys) * 0.95) : 0
  const yMax = ys.length ? Math.ceil(Math.max(...ys) * 1.05) : 100

  const GREY = '#cbd5e1'
  const MID = '#94a3b8'
  const BRAND = '#1e3a5f'

  return (
    <div className="card p-5">
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
        {cfg.label} — WHO percentiles ({sex === 'male' ? 'boys' : 'girls'})
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="ageM" type="number" domain={[0, 60]}
            ticks={[0, 6, 12, 18, 24, 36, 48, 60]}
            tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
            label={{ value: 'Age (months)', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#9ca3af' }}
          />
          <YAxis
            domain={[yMin, yMax]} tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false} axisLine={false} width={40}
            label={{ value: cfg.yLabel, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#9ca3af' }}
          />
          <Tooltip
            formatter={(v: any, name: string) => [`${v} ${cfg.unit}`, name]}
            labelFormatter={(l: any) => `${Number(l).toFixed(1)} mo`}
            contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #e5e7eb' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />

          <Line type="monotone" dataKey="P97" name="97th" stroke={GREY} strokeWidth={1} dot={false} connectNulls />
          <Line type="monotone" dataKey="P85" name="85th" stroke={GREY} strokeWidth={1} dot={false} connectNulls />
          <Line type="monotone" dataKey="P50" name="50th" stroke={MID} strokeWidth={1.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="P15" name="15th" stroke={GREY} strokeWidth={1} dot={false} connectNulls />
          <Line type="monotone" dataKey="P3"  name="3rd"  stroke={GREY} strokeWidth={1} dot={false} connectNulls />

          <Line
            type="monotone" dataKey="child" name={cfg.label}
            stroke={BRAND} strokeWidth={2}
            dot={{ r: 4, fill: BRAND, strokeWidth: 0 }} activeDot={{ r: 6 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
