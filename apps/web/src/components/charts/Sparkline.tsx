'use client'

import { useId } from 'react'

/**
 * Tiny dependency-free sparkline: smooth-ish area + line + end dot.
 * Colours are passed in so it reads on both light and dark surfaces.
 */
export default function Sparkline({
  values,
  color = '#2563EB',
  width = 120,
  height = 36,
  strokeWidth = 2,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
  strokeWidth?: number
}) {
  const gid = useId().replace(/[:]/g, '')

  if (!values || values.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line
          x1="0" y1={height - 4} x2={width} y2={height - 4}
          stroke={color} strokeOpacity={0.25} strokeWidth={strokeWidth}
          strokeDasharray="3 3" strokeLinecap="round"
        />
      </svg>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 3
  const stepX = (width - pad * 2) / (values.length - 1)
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span)

  const pts = values.map((v, i) => [pad + i * stepX, y(v)] as const)
  const line = pts.map(([x, yy], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${yy.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${height} L${pts[0][0].toFixed(1)} ${height} Z`
  const [lx, ly] = pts[pts.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.6} fill={color} />
      <circle cx={lx} cy={ly} r={5} fill={color} fillOpacity={0.18} />
    </svg>
  )
}
