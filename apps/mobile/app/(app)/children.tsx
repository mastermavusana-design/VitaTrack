import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ageInDays } from '@vitatrack/shared'
import type { Dependant } from '@vitatrack/shared'
import { useChildrenStore } from '@/hooks/useChildren'
import { rescheduleImmunisations } from '@/notifications/scheduler'
import { Colors } from '@/constants/Colors'
import ScreenHeader from '@/components/ScreenHeader'

function formatAge(dobISO: string): string {
  const days = ageInDays(dobISO, new Date().toISOString().slice(0, 10))
  if (days < 0) return '—'
  const totalMonths = Math.floor(days / 30.4375)
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years === 0) return `${totalMonths} mo`
  if (months === 0) return `${years} yr`
  return `${years} yr ${months} mo`
}

const SEX_LABEL: Record<string, string> = { male: 'Boy', female: 'Girl' }

export default function ChildrenScreen() {
  const [refreshing, setRefreshing] = useState(false)
  const { fetchDependants, fetchDueImmunisations } = useChildrenStore()

  const { data: dependants = [], refetch } = useQuery({
    queryKey: ['dependants'],
    queryFn: fetchDependants,
  })

  // Keep local booster reminders in sync with the guardian's due doses.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const due = await fetchDueImmunisations()
        if (!cancelled) await rescheduleImmunisations(due)
      } catch { /* best-effort; scheduling is non-critical */ }
    })()
    return () => { cancelled = true }
  }, [dependants.length])

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScreenHeader
        title="👶 Children"
        right={
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => router.push('/(app)/children/add')}
            accessibilityRole="button"
            accessibilityLabel="Add child"
          >
            <Text style={s.addBtnText}>＋</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={dependants}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ChildCard child={item} />}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/(app)/children/add')}
        accessibilityRole="button"
        accessibilityLabel="Add a child"
      >
        <Text style={s.fabText}>＋ Add Child</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

function ChildCard({ child }: { child: Dependant }) {
  const initial = child.full_name.trim().charAt(0).toUpperCase()
  const meta = [
    formatAge(child.date_of_birth),
    child.sex ? (SEX_LABEL[child.sex] ?? child.sex) : null,
    child.rthb_number ? `RtHB ${child.rthb_number}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => router.push(`/(app)/children/${child.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${child.full_name}`}
    >
      <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{child.full_name}</Text>
        <Text style={s.meta}>{meta}</Text>
      </View>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  )
}

function EmptyState() {
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>👶</Text>
      <Text style={s.emptyText}>No children yet.</Text>
      <Text style={s.emptySub}>Add a child to start their immunisation schedule, growth chart and milestones.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: Colors.background },
  addBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  addBtnText:  { fontSize: 22, color: '#fff', fontWeight: '300' },
  list:        { padding: 16, gap: 10, paddingBottom: 96 },
  card:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  avatar:      { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 18, fontWeight: '800', color: Colors.primary },
  name:        { fontSize: 15, fontWeight: '800', color: Colors.text },
  meta:        { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  chevron:     { fontSize: 24, color: Colors.textMuted, fontWeight: '300' },
  fab:         { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  fabText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty:       { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyIcon:   { fontSize: 48, marginBottom: 16 },
  emptyText:   { fontSize: 15, fontWeight: '700', color: Colors.text },
  emptySub:    { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6 },
})
