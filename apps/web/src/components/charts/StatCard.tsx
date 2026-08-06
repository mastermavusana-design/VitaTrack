import Sparkline from './Sparkline'

/**
 * KPI stat card: big value, classification badge, delta-vs-previous, and a
 * sparkline of the recent trend. Presentational — the Sparkline is a client
 * island but the card itself needs no interactivity.
 */
export default function StatCard({
  label,
  value,
  unit,
  badge,
  delta,
  spark,
  color = '#2563EB',
  time,
  icon,
}: {
  label: string
  value: string
  unit?: string
  badge?: { text: string; color: string; bg: string } | null
  delta?: number | null
  spark?: number[]
  color?: string
  time?: string
  icon?: React.ReactNode
}) {
  const hasDelta = delta != null && delta !== 0
  const up = (delta ?? 0) > 0

  return (
    <div className="card card-hover p-5 flex flex-col animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && (
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: color + '1A', color }}
            >
              {icon}
            </span>
          )}
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
        </div>
        {badge && (
          <span className="badge text-[11px] px-2.5 py-1" style={{ backgroundColor: badge.bg, color: badge.color }}>
            {badge.text}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-gray-900 leading-none">{value}</span>
            {unit && <span className="text-sm text-gray-400 font-semibold">{unit}</span>}
          </div>
          {hasDelta ? (
            <p className="text-xs font-semibold mt-1.5 flex items-center gap-1 text-gray-500">
              <span aria-hidden style={{ color }}>{up ? '▲' : '▼'}</span>
              {Math.abs(delta as number)} {unit ?? ''} <span className="text-gray-400 font-normal">vs last</span>
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1.5">{time ?? 'No prior reading'}</p>
          )}
        </div>
        {spark && spark.length > 1 && (
          <div className="shrink-0">
            <Sparkline values={spark} color={color} width={104} height={40} />
          </div>
        )}
      </div>
    </div>
  )
}
