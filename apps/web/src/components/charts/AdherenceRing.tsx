'use client'

/**
 * Adherence donut. Pure SVG so it's crisp and cheap; the numeric rate sits in
 * the centre with a small caption underneath.
 */
export default function AdherenceRing({
  rate,
  color,
  size = 168,
  stroke = 14,
  label,
  caption,
}: {
  rate: number
  color: string
  size?: number
  stroke?: number
  label?: string
  caption?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, rate))
  const dash = (pct / 100) * c

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke}
          className="text-gray-100 dark:text-slate-800"
          stroke="currentColor"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-gray-900" style={{ color }}>{pct}<span className="text-xl align-top">%</span></span>
        {label && <span className="text-[11px] font-bold uppercase tracking-widest mt-0.5" style={{ color }}>{label}</span>}
        {caption && <span className="text-[11px] text-gray-400 mt-0.5">{caption}</span>}
      </div>
    </div>
  )
}
