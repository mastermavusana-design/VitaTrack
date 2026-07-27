/**
 * VitalsTrendChart — pure react-native-svg implementation.
 *
 * Replaces the victory-native / @shopify/react-native-skia version so the chart
 * works in Expo Go (neither Skia nor worklets are bundled in Expo Go).
 *
 * Shows up to 30 days of readings as a smooth polyline with an area fill.
 * Blood pressure renders two lines (systolic + diastolic).
 */
import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg'
import type { Vital, VitalType } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'

interface VitalsTrendChartProps {
  vitals: Vital[]
  type: VitalType
}

const W = 320
const H = 110
const PAD = { top: 10, right: 8, bottom: 20, left: 32 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

function toPoints(xs: number[], ys: number[]): string {
  return xs.map((x, i) => `${x},${ys[i]}`).join(' ')
}

function normalize(values: number[], minV: number, maxV: number): number[] {
  const range = maxV === minV ? 1 : maxV - minV
  return values.map(v => CH - ((v - minV) / range) * CH)
}

function scatterX(days: number[], total = 29): number[] {
  return days.map(d => PAD.left + (d / total) * CW)
}

export default function VitalsTrendChart({ vitals, type }: VitalsTrendChartProps) {
  const data = useMemo(() => {
    const now = Date.now()
    const day0 = now - 29 * 86_400_000

    const pts = vitals
      .filter(v => new Date(v.recorded_at).getTime() >= day0)
      .map(v => {
        const dayIndex = Math.floor((new Date(v.recorded_at).getTime() - day0) / 86_400_000)
        if (type === 'blood_pressure' && v.systolic && v.diastolic) {
          return { day: dayIndex, primary: v.systolic, secondary: v.diastolic }
        }
        if (type === 'glucose' && v.glucose_value) {
          return { day: dayIndex, primary: v.glucose_value }
        }
        if (type === 'weight' && v.weight_value) {
          return { day: dayIndex, primary: v.weight_value }
        }
        return null
      })
      .filter(Boolean)
      .sort((a, b) => a!.day - b!.day) as { day: number; primary: number; secondary?: number }[]

    return pts
  }, [vitals, type])

  if (data.length < 2) {
    return (
      <View style={s.placeholder}>
        <Text style={s.placeholderText}>
          {data.length === 0
            ? '📈 No readings in the last 30 days'
            : '📈 Log at least 2 readings to see your trend'}
        </Text>
      </View>
    )
  }

  const primaryColor = type === 'blood_pressure' ? Colors.danger
    : type === 'glucose' ? Colors.warning
    : Colors.primary
  const secondaryColor = '#93C5FD'

  const days = data.map(d => d.day)
  const px = scatterX(days)

  const allPrimary = data.map(d => d.primary)
  const allSecondary = type === 'blood_pressure' ? data.map(d => d.secondary!) : []

  const globalMin = Math.min(...allPrimary, ...allSecondary) * 0.97
  const globalMax = Math.max(...allPrimary, ...allSecondary) * 1.03

  const py = normalize(allPrimary, globalMin, globalMax).map(y => y + PAD.top)
  const sy = allSecondary.length
    ? normalize(allSecondary, globalMin, globalMax).map(y => y + PAD.top)
    : []

  const bottomY = PAD.top + CH
  const primaryPts = toPoints(px, py)
  const secondaryPts = sy.length ? toPoints(px, sy) : ''

  const primaryArea = `${primaryPts} ${px[px.length - 1]},${bottomY} ${px[0]},${bottomY}`
  const secondaryArea = sy.length
    ? `${secondaryPts} ${px[px.length - 1]},${bottomY} ${px[0]},${bottomY}`
    : ''

  const yLabels = [Math.round(globalMin), Math.round((globalMin + globalMax) / 2), Math.round(globalMax)]

  return (
    <View>
      <Svg width={W} height={H}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((frac, i) => {
          const y = PAD.top + frac * CH
          return (
            <Line
              key={i}
              x1={PAD.left} y1={y}
              x2={PAD.left + CW} y2={y}
              stroke={Colors.border} strokeWidth={0.8} strokeDasharray="3,3"
            />
          )
        })}

        {/* Y-axis labels */}
        {[0, 0.5, 1].map((frac, i) => {
          const y = PAD.top + frac * CH
          const val = yLabels[2 - i]
          return (
            <SvgText
              key={i}
              x={PAD.left - 4} y={y + 4}
              fontSize={9} fill={Colors.textMuted} textAnchor="end"
            >
              {val}
            </SvgText>
          )
        })}

        {/* Secondary area + line (diastolic) */}
        {secondaryArea !== '' && (
          <>
            <Polygon points={secondaryArea} fill={secondaryColor} opacity={0.12} />
            <Polyline
              points={secondaryPts}
              fill="none" stroke={secondaryColor} strokeWidth={1.5}
            />
          </>
        )}

        {/* Primary area + line */}
        <Polygon points={primaryArea} fill={primaryColor} opacity={0.12} />
        <Polyline
          points={primaryPts}
          fill="none" stroke={primaryColor} strokeWidth={2}
        />

        {/* Dot on last reading */}
        <Circle
          cx={px[px.length - 1]} cy={py[py.length - 1]}
          r={4} fill={primaryColor}
        />
        {sy.length > 0 && (
          <Circle
            cx={px[px.length - 1]} cy={sy[sy.length - 1]}
            r={3.5} fill={secondaryColor}
          />
        )}
      </Svg>

      {type === 'blood_pressure' && (
        <View style={s.legend}>
          <LegendDot color={Colors.danger} label="Systolic" />
          <LegendDot color={secondaryColor} label="Diastolic" />
        </View>
      )}
    </View>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  placeholder:     { height: 100, backgroundColor: Colors.primaryBg, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#93C5FD' },
  placeholderText: { color: '#93C5FD', fontSize: 13 },
  legend:          { flexDirection: 'row', gap: 16, marginTop: 4, paddingLeft: PAD.left },
  legendItem:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:       { width: 8, height: 8, borderRadius: 4 },
  legendText:      { fontSize: 11, color: Colors.textMuted },
})
