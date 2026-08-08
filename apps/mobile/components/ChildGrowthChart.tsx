/**
 * ChildGrowthChart — pure react-native-svg WHO growth chart (parity with the
 * web GrowthChart, but Expo-Go-safe like VitalsTrendChart — no Skia/victory).
 *
 * Draws the WHO P3 / P50 / P97 percentile curves for an age-based indicator
 * (weight / length-height / head-circumference for age), computed on the fly
 * from the shared LMS engine + reference tables, and overlays the child's
 * measurements. x-axis is age in months (0–60).
 */
import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Polyline, Circle, Line, Text as SvgText, G } from 'react-native-svg'
import {
  getLMSTable, percentileToZ, zToMeasurement, ageInDays,
} from '@vitatrack/shared'
import type { GrowthMeasurement, Sex } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'

export type IndicatorKey = 'wfa' | 'lhfa' | 'hcfa'

export const GROWTH_INDICATORS: Record<IndicatorKey, {
  label: string; short: string; unit: string; field: keyof GrowthMeasurement
}> = {
  wfa:  { label: 'Weight-for-age', short: 'Weight', unit: 'kg', field: 'weight_kg' },
  lhfa: { label: 'Length/height',  short: 'Height', unit: 'cm', field: 'length_cm' },
  hcfa: { label: 'Head circ.',     short: 'Head',   unit: 'cm', field: 'head_circ_cm' },
}

const DAYS_PER_MONTH = 30.4375
const MAX_MONTHS = 60
const W = 320
const H = 220
const PAD = { top: 12, right: 10, bottom: 26, left: 34 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

interface Props {
  sex: Sex | null
  dob: string
  measurements: GrowthMeasurement[]
  indicator: IndicatorKey
}

type Pt = { ageM: number; v: number }

export default function ChildGrowthChart({ sex, dob, measurements, indicator }: Props) {
  const cfg = GROWTH_INDICATORS[indicator]

  const model = useMemo(() => {
    if (!sex) return null
    const table = getLMSTable(indicator, sex)
    if (!table) return null

    const knots = table.points.filter(p => p.x <= MAX_MONTHS * DAYS_PER_MONTH + 1)
    const curve = (pct: number): Pt[] => knots.map(p => ({
      ageM: p.x / DAYS_PER_MONTH,
      v: zToMeasurement(percentileToZ(pct), p),
    }))
    const p3 = curve(3), p50 = curve(50), p97 = curve(97)

    const child: Pt[] = measurements
      .map(m => ({ m, value: m[cfg.field] as number | null }))
      .filter(({ m, value }) => value != null && m.measured_at >= dob)
      .map(({ m, value }) => ({ ageM: ageInDays(dob, m.measured_at) / DAYS_PER_MONTH, v: value as number }))
      .sort((a, b) => a.ageM - b.ageM)

    const ys = [...p3, ...p97, ...child].map(d => d.v)
    const yMin = Math.min(...ys) * 0.96
    const yMax = Math.max(...ys) * 1.04
    return { p3, p50, p97, child, yMin, yMax }
  }, [sex, dob, measurements, indicator, cfg.field])

  if (!sex) {
    return (
      <View style={s.placeholder}>
        <Text style={s.placeholderText}>Set the child&apos;s sex to see WHO percentile curves.</Text>
      </View>
    )
  }
  if (!model) {
    return <View style={s.placeholder}><Text style={s.placeholderText}>Reference data unavailable.</Text></View>
  }

  const { p3, p50, p97, child, yMin, yMax } = model
  const xOf = (ageM: number) => PAD.left + (Math.min(ageM, MAX_MONTHS) / MAX_MONTHS) * CW
  const yOf = (v: number) => PAD.top + CH - ((v - yMin) / (yMax - yMin || 1)) * CH
  const toPts = (arr: Pt[]) => arr.map(d => `${xOf(d.ageM)},${yOf(d.v)}`).join(' ')

  const yTicks = [yMin, (yMin + yMax) / 2, yMax]
  const xTicks = [0, 12, 24, 36, 48, 60]

  return (
    <View>
      <Svg width={W} height={H}>
        {/* Y grid + labels */}
        {yTicks.map((val, i) => {
          const y = yOf(val)
          return (
            <G key={`y${i}`}>
              <Line x1={PAD.left} y1={y} x2={PAD.left + CW} y2={y} stroke={Colors.border} strokeWidth={0.8} strokeDasharray="3,3" />
              <SvgText x={PAD.left - 4} y={y + 3} fontSize={9} fill={Colors.textMuted} textAnchor="end">
                {val.toFixed(val < 20 ? 1 : 0)}
              </SvgText>
            </G>
          )
        })}

        {/* X labels */}
        {xTicks.map((mo, i) => (
          <SvgText key={`x${i}`} x={xOf(mo)} y={H - 8} fontSize={9} fill={Colors.textMuted} textAnchor="middle">{mo}</SvgText>
        ))}

        {/* Percentile curves */}
        <Polyline points={toPts(p97)} fill="none" stroke={Colors.border} strokeWidth={1} />
        <Polyline points={toPts(p50)} fill="none" stroke={Colors.textMuted} strokeWidth={1.4} />
        <Polyline points={toPts(p3)}  fill="none" stroke={Colors.border} strokeWidth={1} />

        {/* Child trajectory */}
        {child.length > 0 && (
          <Polyline points={toPts(child)} fill="none" stroke={Colors.primary} strokeWidth={2} />
        )}
        {child.map((d, i) => (
          <Circle key={`c${i}`} cx={xOf(d.ageM)} cy={yOf(d.v)} r={3.5} fill={Colors.primary} />
        ))}
      </Svg>

      <View style={s.legend}>
        <Text style={s.legendText}>
          Grey: WHO 3rd / 50th / 97th percentile ({sex === 'male' ? 'boys' : 'girls'}) · Blue: {cfg.short.toLowerCase()} · x = months
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  placeholder:     { height: 180, backgroundColor: Colors.primaryBg, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#93C5FD' },
  placeholderText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' },
  legend:          { marginTop: 6, paddingLeft: PAD.left },
  legendText:      { fontSize: 10, color: Colors.textMuted, lineHeight: 14 },
})
