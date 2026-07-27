'use client'

import { useMemo } from 'react'
import { groupLogsByDate } from '@vitatrack/shared'
import type { DoseLog } from '@vitatrack/shared'

interface AdherenceChartProps {
  logs: DoseLog[]
}

/**
 * A simple 30-day adherence bar chart rendered with pure SVG.
 * Each bar = one day; colour = taken (green) / partial (amber) / missed (red) / none (gray).
 * Uses no external chart library — keeps bundle small.
 *
 * groupLogsByDate returns Record<string, Record<DoseStatus, number>>, i.e.
 * { '2024-01-15': { taken: 2, missed: 0, skipped: 0, pending: 0 }, … }
 */
export default function AdherenceChart({ logs }: AdherenceChartProps) {
  const days = useMemo(() => {
    const grouped = groupLogsByDate(logs)
    const result: { date: string; rate: number; color: string }[] = []

    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const dayCounts = grouped[key]

      if (!dayCounts) {
        result.push({ date: key, rate: 0, color: '#E5E7EB' })
        continue
      }

      const taken   = dayCounts.taken   ?? 0
      const missed  = dayCounts.missed  ?? 0
      const skipped = dayCounts.skipped ?? 0
      const pending = dayCounts.pending ?? 0
      const total   = taken + missed + skipped + pending

      const rate = total > 0 ? (taken / total) * 100 : 0

      let color = '#10B981' // green — ≥80% taken
      if (rate === 0)      color = '#EF4444' // red — nothing taken
      else if (rate < 80) color = '#F59E0B' // amber — partial

      result.push({ date: key, rate, color })
    }
    return result
  }, [logs])

  const barWidth  = 8
  const barGap    = 3
  const maxHeight = 48
  const width     = days.length * (barWidth + barGap)

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${maxHeight + 16}`}
        width="100%"
        height={maxHeight + 16}
        preserveAspectRatio="none"
      >
        {days.map((day, i) => {
          const h = day.rate > 0 ? Math.max(4, (day.rate / 100) * maxHeight) : 4
          const x = i * (barWidth + barGap)
          const y = maxHeight - h

          return (
            <g key={day.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={2}
                fill={day.color}
                opacity={day.rate === 0 && day.color === '#E5E7EB' ? 0.5 : 1}
              />
            </g>
          )
        })}
      </svg>

      <div className="flex justify-between text-xs text-gray-300 mt-1">
        <span>30 days ago</span>
        <span>Today</span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3">
        {[
          { color: '#10B981', label: 'Taken' },
          { color: '#F59E0B', label: 'Partial' },
          { color: '#EF4444', label: 'Missed' },
          { color: '#E5E7EB', label: 'No doses' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
