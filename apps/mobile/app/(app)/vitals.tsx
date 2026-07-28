import { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useVitalsStore } from '@/hooks/useVitals'
import { classifyBP, classifyGlucose, formatDate, formatTime } from '@vitatrack/shared'
import type { VitalType, Vital } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'
import VitalsTrendChart from '@/components/VitalsTrendChart'

type VitalTab = { key: VitalType; label: string; icon: string }
const TABS: VitalTab[] = [
  { key: 'blood_pressure', label: 'Blood Pressure', icon: '❤️' },
  { key: 'glucose',        label: 'Glucose',         icon: '🩸' },
  { key: 'weight',         label: 'Weight',           icon: '⚖️' },
]

export default function VitalsScreen() {
  const params = useLocalSearchParams<{ type?: VitalType }>()
  const [activeTab, setActiveTab] = useState<VitalType>(params.type ?? 'blood_pressure')
  const [refreshing, setRefreshing] = useState(false)
  const { fetchVitals } = useVitalsStore()

  const { data: vitals = [], refetch } = useQuery({
    queryKey: ['vitals', activeTab],
    queryFn: () => fetchVitals(activeTab),
  })

  const latestVital = vitals[0]

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>📊 Vitals</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.addBtn}
            onPress={() => router.push(`/(app)/vitals/scan?artifact=device_screen&vitalType=${activeTab}`)}>
            <Text style={s.addBtnText}>⧉</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push(`/(app)/vitals/add?type=${activeTab}`)}>
            <Text style={s.addBtnText}>＋</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Type tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabContent}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}>
            <Text style={s.tabIcon}>{tab.icon}</Text>
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={vitals}
        keyExtractor={item => item.id}
        ListHeaderComponent={() => <VitalsHeader vital={latestVital} type={activeTab} vitals={vitals} />}
        renderItem={({ item }) => <VitalRow vital={item} type={activeTab} />}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyVitals type={activeTab} />}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity style={s.fab} onPress={() => router.push(`/(app)/vitals/add?type=${activeTab}`)}>
        <Text style={s.fabText}>＋ Log {TABS.find(t => t.key === activeTab)?.label}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

function VitalsHeader({ vital, type, vitals }: { vital: Vital | undefined; type: VitalType; vitals: Vital[] }) {
  if (!vital) return null

  let mainValue = '—'
  let unit = ''
  let classification = null

  if (type === 'blood_pressure' && vital.systolic && vital.diastolic) {
    mainValue = `${vital.systolic}/${vital.diastolic}`
    unit = 'mmHg'
    classification = classifyBP(vital.systolic, vital.diastolic)
  } else if (type === 'glucose' && vital.glucose_value) {
    mainValue = vital.glucose_value.toFixed(1)
    unit = vital.glucose_unit ?? 'mmol/L'
    classification = classifyGlucose(vital.glucose_value, vital.meal_context ?? 'fasting')
  } else if (type === 'weight' && vital.weight_value) {
    mainValue = vital.weight_value.toString()
    unit = vital.weight_unit ?? 'kg'
  }

  return (
    <View style={s.latestCard}>
      <Text style={s.latestLabel}>Latest Reading</Text>
      <View style={s.latestRow}>
        <View>
          <Text style={s.latestValue}>{mainValue}</Text>
          <Text style={s.latestUnit}>{unit}</Text>
          {vital.pulse && type === 'blood_pressure' && (
            <Text style={s.latestPulse}>Pulse {vital.pulse} bpm</Text>
          )}
        </View>
        {classification && (
          <View style={[s.classBadge, { backgroundColor: classification.bgColor }]}>
            <Text style={[s.classBadgeText, { color: classification.color }]}>{classification.label}</Text>
          </View>
        )}
      </View>
      <Text style={s.latestTime}>{formatDate(vital.recorded_at)} · {formatTime(vital.recorded_at)}</Text>

      {/* 30-day trend chart */}
      <VitalsTrendChart vitals={vitals} type={type} />

      {/* Range selector */}
      <View style={s.rangeRow}>
        {['30d', '90d', 'All'].map(r => (
          <TouchableOpacity key={r} style={s.rangeChip}>
            <Text style={s.rangeChipText}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.latestLabel, { marginTop: 16 }]}>History</Text>
    </View>
  )
}

function VitalRow({ vital, type }: { vital: Vital; type: VitalType }) {
  let valueText = '—'
  let badge: { text: string; color: string; bg: string } | null = null

  if (type === 'blood_pressure' && vital.systolic && vital.diastolic) {
    valueText = `${vital.systolic}/${vital.diastolic} mmHg · ${vital.pulse ?? '—'} bpm`
    const cls = classifyBP(vital.systolic, vital.diastolic)
    if (cls) badge = { text: cls.label, color: cls.color, bg: cls.bgColor }
  } else if (type === 'glucose' && vital.glucose_value) {
    valueText = `${vital.glucose_value.toFixed(1)} ${vital.glucose_unit ?? 'mmol/L'} · ${vital.meal_context?.replace('_', ' ') ?? ''}`
    const cls = classifyGlucose(vital.glucose_value, vital.meal_context ?? 'fasting')
    badge = { text: cls.label, color: cls.color, bg: cls.bgColor }
  } else if (type === 'weight' && vital.weight_value) {
    valueText = `${vital.weight_value} ${vital.weight_unit ?? 'kg'}`
  }

  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowValue}>{valueText}</Text>
        <Text style={s.rowTime}>{formatDate(vital.recorded_at)} · {formatTime(vital.recorded_at)}</Text>
      </View>
      {badge && (
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.color }]}>{badge.text}</Text>
        </View>
      )}
    </View>
  )
}

function EmptyVitals({ type }: { type: VitalType }) {
  const labels: Record<VitalType, string> = {
    blood_pressure: 'No blood pressure readings yet.',
    glucose:        'No glucose readings yet.',
    weight:         'No weight readings yet.',
    temperature:    'No temperature readings yet.',
    spo2:           'No SpO2 readings yet.',
    heart_rate:     'No heart rate readings yet.',
  }
  return (
    <View style={s.empty}>
      <Text style={s.emptyText}>{labels[type]}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:               { flex: 1, backgroundColor: Colors.background },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle:        { fontSize: 18, fontWeight: '800', color: '#fff' },
  addBtn:             { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  addBtnText:         { fontSize: 22, color: '#fff' },
  tabBar:             { backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabContent:         { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tab:                { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border },
  tabActive:          { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabIcon:            { fontSize: 15 },
  tabText:            { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive:      { color: '#fff' },
  list:               { paddingBottom: 96 },
  latestCard:         { padding: 16 },
  latestLabel:        { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: Colors.textMuted, marginBottom: 8 },
  latestRow:          { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4 },
  latestValue:        { fontSize: 36, fontWeight: '900', color: Colors.primary },
  latestUnit:         { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  latestPulse:        { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  classBadge:         { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  classBadgeText:     { fontSize: 13, fontWeight: '700' },
  latestTime:         { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },
  chartPlaceholder:   { height: 100, backgroundColor: Colors.primaryBg, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#93C5FD', marginBottom: 10 },
  chartPlaceholderText: { color: '#93C5FD', fontSize: 13 },
  rangeRow:           { flexDirection: 'row', gap: 8, marginBottom: 8 },
  rangeChip:          { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  rangeChipText:      { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  row:                { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card },
  rowValue:           { fontSize: 14, fontWeight: '700', color: Colors.text },
  rowTime:            { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  badge:              { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:          { fontSize: 11, fontWeight: '700' },
  fab:                { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  fabText:            { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty:              { padding: 48, alignItems: 'center' },
  emptyText:          { fontSize: 15, color: Colors.textSecondary },
})
