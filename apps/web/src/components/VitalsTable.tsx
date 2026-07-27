import { classifyBP, classifyGlucose, formatDate, formatTime } from '@vitatrack/shared'
import type { Vital } from '@vitatrack/shared'

interface VitalsTableProps {
  vitals: Vital[]
}

export default function VitalsTable({ vitals }: VitalsTableProps) {
  if (!vitals.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">No vitals recorded yet.</p>
    )
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-xs font-black text-gray-400 uppercase tracking-wider pb-2 pr-4">Type</th>
            <th className="text-left text-xs font-black text-gray-400 uppercase tracking-wider pb-2 pr-4">Value</th>
            <th className="text-left text-xs font-black text-gray-400 uppercase tracking-wider pb-2 pr-4">Classification</th>
            <th className="text-left text-xs font-black text-gray-400 uppercase tracking-wider pb-2">Date / Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {vitals.map(v => {
            const { label, value, unit, badge } = formatVitalRow(v)
            return (
              <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-2.5 pr-4">
                  <span className="font-medium text-gray-700">{label}</span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className="font-semibold text-gray-900">{value}</span>
                  {unit && <span className="text-gray-400 ml-1 text-xs">{unit}</span>}
                </td>
                <td className="py-2.5 pr-4">
                  {badge ? (
                    <span
                      className="badge text-xs px-2.5 py-0.5"
                      style={{ backgroundColor: badge.bg, color: badge.color }}
                    >
                      {badge.text}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="py-2.5 text-gray-400 text-xs">
                  {formatDate(v.recorded_at)} · {formatTime(v.recorded_at)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatVitalRow(v: Vital): {
  label: string
  value: string
  unit: string
  badge: { text: string; color: string; bg: string } | null
} {
  switch (v.type) {
    case 'blood_pressure': {
      const val = v.systolic && v.diastolic ? `${v.systolic}/${v.diastolic}` : '—'
      const cls = v.systolic && v.diastolic ? classifyBP(v.systolic, v.diastolic) : null
      return {
        label: '❤️ Blood Pressure',
        value: val,
        unit:  'mmHg',
        badge: cls ? { text: cls.label, color: cls.color, bg: cls.bgColor } : null,
      }
    }
    case 'glucose': {
      const cls = v.glucose_value
        ? classifyGlucose(v.glucose_value, v.meal_context ?? 'fasting')
        : null
      return {
        label: '🩸 Glucose',
        value: v.glucose_value?.toFixed(1) ?? '—',
        unit:  v.glucose_unit ?? 'mmol/L',
        badge: cls ? { text: cls.label, color: cls.color, bg: cls.bgColor } : null,
      }
    }
    case 'weight':
      return {
        label: '⚖️ Weight',
        value: v.weight_value?.toString() ?? '—',
        unit:  v.weight_unit ?? 'kg',
        badge: null,
      }
    case 'temperature':
      return {
        label: '🌡️ Temperature',
        value: v.temp_value?.toFixed(1) ?? '—',
        unit:  v.temp_unit ?? '°C',
        badge: null,
      }
    case 'spo2':
      return {
        label: '💨 SpO2',
        value: v.spo2_value?.toString() ?? '—',
        unit:  '%',
        badge: null,
      }
    case 'heart_rate':
      return {
        label: '💓 Heart Rate',
        value: v.heart_rate?.toString() ?? '—',
        unit:  'bpm',
        badge: null,
      }
    default:
      return { label: v.type, value: '—', unit: '', badge: null }
  }
}
