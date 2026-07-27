'use client'

/**
 * VitalsTrendChart — Recharts line chart for the web vitals dashboard.
 * Renders a responsive LineChart for the selected vital type.
 *   • Blood pressure → two lines (Systolic + Diastolic)
 *   • Glucose        → single line with mmol/L or mg/dL label
 *   • Weight         → single line (kg / lb)
 *   • Temperature    → single line (°C)
 *   • SpO2           → single line (%)
 *   • Heart rate     → single line (bpm)
 *
 * Data must be sorted ascending by recorded_at before passing in.
 */

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { Vital, VitalType } from '@vitatrack/shared'

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Props {
  vitals: Vital[]
  type:   VitalType
}

interface ChartPoint {
  date:      string   // "MMM d"
  primary?:  number | null
  secondary?: number | null
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

function extractPoint(v: Vital, type: VitalType): { primary?: number | null; secondary?: number | null } {
  switch (type) {
    case 'blood_pressure': return { primary: v.systolic,     secondary: v.diastolic }
    case 'glucose':        return { primary: v.glucose_value }
    case 'weight':         return { primary: v.weight_value }
    case 'temperature':    return { primary: v.temp_value }
    case 'spo2':           return { primary: v.spo2_value }
    case 'heart_rate':     return { primary: v.heart_rate }
    default:               return {}
  }
}

function unitLabel(type: VitalType): string {
  switch (type) {
    case 'blood_pressure': return 'mmHg'
    case 'glucose':        return 'mmol/L'
    case 'weight':         return 'kg'
    case 'temperature':    return '°C'
    case 'spo2':           return '%'
    case 'heart_rate':     return 'bpm'
    default:               return ''
  }
}

/* ─── Custom tooltip ─────────────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label, type }: any) {
  if (!active || !payload?.length) return null
  const unit = unitLabel(type)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value != null ? `${p.value} ${unit}` : '—'}
        </p>
      ))}
    </div>
  )
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function VitalsTrendChart({ vitals, type }: Props) {
  if (!vitals.length) {
    return (
      <div className="card p-5 flex items-center justify-center h-48 text-gray-400 text-sm">
        No data to chart for this period.
      </div>
    )
  }

  // Sort ascending for the chart (page fetches descending for the table)
  const sorted = [...vitals].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  )

  const data: ChartPoint[] = sorted.map(v => ({
    date: fmtDate(v.recorded_at),
    ...extractPoint(v, type),
  }))

  const isBP       = type === 'blood_pressure'
  const primaryKey  = 'primary'
  const secondaryKey = 'secondary'

  // Y-axis domain padding
  const allVals = data.flatMap(d => [d.primary, d.secondary]).filter((v): v is number => v != null)
  const yMin = allVals.length ? Math.floor(Math.min(...allVals) * 0.95) : 0
  const yMax = allVals.length ? Math.ceil(Math.max(...allVals) * 1.05) : 200

  // Reference lines for BP normal ranges
  const bpRefLines = isBP
    ? [
        { y: 120, label: 'Normal sys', color: '#10b981' },
        { y: 80,  label: 'Normal dia', color: '#6ee7b7' },
        { y: 140, label: 'Stage 1 sys', color: '#f59e0b' },
      ]
    : []

  return (
    <div className="card p-5">
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
        Trend — last {vitals.length} readings
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip content={<CustomTooltip type={type} />} />
          {isBP && <Legend wrapperStyle={{ fontSize: 12 }} />}

          {/* Reference lines */}
          {bpRefLines.map(r => (
            <ReferenceLine
              key={r.y}
              y={r.y}
              stroke={r.color}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          ))}

          {/* Primary line (systolic / single metric) */}
          <Line
            type="monotone"
            dataKey={primaryKey}
            name={isBP ? 'Systolic' : unitLabel(type)}
            stroke="#1e3a5f"
            strokeWidth={2}
            dot={{ r: 3, fill: '#1e3a5f', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
          />

          {/* Secondary line (diastolic — BP only) */}
          {isBP && (
            <Line
              type="monotone"
              dataKey={secondaryKey}
              name="Diastolic"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
