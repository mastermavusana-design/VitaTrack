import { useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useMedicationsStore } from '@/hooks/useMedications'
import type { MedicationWithSchedules } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'
import ScreenHeader from '@/components/ScreenHeader'

type FilterKey = 'all' | 'active' | 'inactive' | 'low_supply'
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'inactive',   label: 'Inactive' },
  { key: 'low_supply', label: 'Low Supply' },
]

export default function MedicationsScreen() {
  const [filter, setFilter] = useState<FilterKey>('active')
  const [refreshing, setRefreshing] = useState(false)
  const { fetchMedications } = useMedicationsStore()

  const { data: medications = [], refetch } = useQuery({
    queryKey: ['medications'],
    queryFn: fetchMedications,
  })

  const filtered = medications.filter(m => {
    if (filter === 'active')     return m.is_active
    if (filter === 'inactive')   return !m.is_active
    if (filter === 'low_supply') return m.is_active && m.pill_count !== null && m.refill_threshold !== null && m.pill_count <= m.refill_threshold
    return true
  })

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <ScreenHeader
        title="💊 Medications"
        right={
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => router.push('/(app)/medications/add')}
            accessibilityRole="button"
            accessibilityLabel="Add medication"
          >
            <Text style={s.addBtnText}>＋</Text>
          </TouchableOpacity>
        }
      />

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterChip, filter === f.key && s.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.filterChipText, filter === f.key && s.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MedicationCard med={item} />}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState filter={filter} />}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/(app)/medications/add')}
        accessibilityRole="button"
        accessibilityLabel="Add new medication"
      >
        <Text style={s.fabText}>＋ Add Medication</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

function MedicationCard({ med }: { med: MedicationWithSchedules }) {
  const isLow = med.pill_count !== null && med.refill_threshold !== null && med.pill_count <= med.refill_threshold
  const isCritical = med.pill_count !== null && med.pill_count <= 5

  const scheduleText = med.schedules?.[0]
    ? `${med.schedules[0].frequency.replace(/_/g, ' ')} · ${med.schedules[0].times.join(', ')}`
    : 'No schedule set'

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => router.push(`/(app)/medications/${med.id}/log`)}
      accessibilityRole="button"
    >
      {/* Colour bar */}
      <View style={[s.colorBar, { backgroundColor: med.color ?? Colors.primary }]} />

      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.medName}>{med.name}</Text>
            {med.strength && (
              <Text style={s.medSub}>{med.strength}{med.strength_unit} · {med.form ?? 'tablet'}</Text>
            )}
            <Text style={s.medSchedule}>{scheduleText}</Text>
          </View>
          {/* Pill count badge */}
          {med.pill_count !== null && (
            <View style={[s.pillBadge, isCritical ? s.pillBadgeCritical : isLow ? s.pillBadgeLow : s.pillBadgeOk]}>
              <Text style={[s.pillBadgeText, isCritical ? { color: Colors.danger } : isLow ? { color: Colors.warning } : { color: Colors.success }]}>
                {isCritical ? '⚠️ ' : ''}{med.pill_count} left
              </Text>
            </View>
          )}
        </View>

        {/* Adherence bar — would use real data via query */}
        {med.is_active && (
          <View style={s.adherenceRow}>
            <View style={s.adherenceBar}>
              <View style={[s.adherenceFill, { width: '82%', backgroundColor: Colors.success }]} />
            </View>
            <Text style={s.adherenceLabel}>82% (28d)</Text>
          </View>
        )}

        {!med.is_active && (
          <Text style={s.inactiveLabel}>Inactive</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

function EmptyState({ filter }: { filter: FilterKey }) {
  const messages: Record<FilterKey, string> = {
    all:        'No medications added yet.',
    active:     'No active medications.',
    inactive:   'No inactive medications.',
    low_supply: 'No medications running low 🎉',
  }
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>💊</Text>
      <Text style={s.emptyText}>{messages[filter]}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:               { flex: 1, backgroundColor: Colors.background },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle:        { fontSize: 18, fontWeight: '800', color: '#fff' },
  addBtn:             { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  addBtnText:         { fontSize: 22, color: '#fff', fontWeight: '300' },
  filterBar:          { backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterContent:      { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip:         { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  filterChipActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText:     { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive:{ color: '#fff' },
  list:               { padding: 16, gap: 10, paddingBottom: 96 },
  card:               { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  colorBar:           { width: 5 },
  cardBody:           { flex: 1, padding: 14, gap: 8 },
  cardTop:            { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  medName:            { fontSize: 15, fontWeight: '800', color: Colors.text },
  medSub:             { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  medSchedule:        { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  pillBadge:          { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  pillBadgeOk:        { backgroundColor: Colors.successBg },
  pillBadgeLow:       { backgroundColor: Colors.warningBg },
  pillBadgeCritical:  { backgroundColor: Colors.dangerBg },
  pillBadgeText:      { fontSize: 11, fontWeight: '700' },
  adherenceRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adherenceBar:       { flex: 1, height: 5, backgroundColor: Colors.borderLight, borderRadius: 3 },
  adherenceFill:      { height: 5, borderRadius: 3 },
  adherenceLabel:     { fontSize: 10, color: Colors.textMuted, width: 60 },
  inactiveLabel:      { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  fab:                { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  fabText:            { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty:              { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:          { fontSize: 48, marginBottom: 16 },
  emptyText:          { fontSize: 15, color: Colors.textSecondary },
})
