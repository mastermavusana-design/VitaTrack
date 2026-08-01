import { useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useMedicationsStore } from '@/hooks/useMedications'
import { formatTime } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'

type NotifKind = 'refill' | 'missed' | 'reminder'

type NotifItem = {
  id: string
  kind: NotifKind
  icon: string
  title: string
  subtitle: string
  accent: string
  onPress: () => void
}

/**
 * Notification inbox. VitaTrack has no dedicated notifications table, so this
 * aggregates the actionable signals the app already tracks — low-supply refill
 * alerts and today's missed / pending doses — into one prioritised list.
 */
export default function NotificationsScreen() {
  const [refreshing, setRefreshing] = useState(false)

  const { data: refillAlerts = [], refetch: refetchRefills } = useQuery({
    queryKey: ['refill-alerts'],
    queryFn: () => useMedicationsStore.getState().fetchRefillAlerts(),
  })
  const { data: todayDoses = [], refetch: refetchDoses, isLoading } = useQuery({
    queryKey: ['today-doses'],
    queryFn: () => useMedicationsStore.getState().fetchTodayDoses(),
  })

  const items: NotifItem[] = useMemo(() => {
    const list: NotifItem[] = []

    // 1. Low-supply refill alerts (most urgent first)
    for (const a of refillAlerts) {
      const critical = a.pill_count <= 5
      list.push({
        id: `refill-${a.medication_id}`,
        kind: 'refill',
        icon: critical ? '⚠️' : '🔄',
        title: `Low supply: ${a.medication_name}`,
        subtitle: `${a.pill_count} left · refill reminder at ${a.refill_threshold}`,
        accent: critical ? Colors.danger : Colors.warning,
        onPress: () => router.push(`/(app)/medications/${a.medication_id}`),
      })
    }

    // 2. Missed doses today
    for (const d of todayDoses.filter(x => x.status === 'missed')) {
      list.push({
        id: `missed-${d.id}`,
        kind: 'missed',
        icon: '❗',
        title: `Missed dose: ${d.medication.name}`,
        subtitle: d.scheduled_at ? `Scheduled ${formatTime(d.scheduled_at)}` : 'Scheduled today',
        accent: Colors.danger,
        onPress: () => router.push(`/(app)/medications/${d.medication_id}/log`),
      })
    }

    // 3. Pending / upcoming doses today
    for (const d of todayDoses.filter(x => x.status === 'pending')) {
      list.push({
        id: `pending-${d.id}`,
        kind: 'reminder',
        icon: '💊',
        title: `Dose due: ${d.medication.name}`,
        subtitle: d.scheduled_at ? `Due at ${formatTime(d.scheduled_at)}` : 'Due today',
        accent: Colors.primary,
        onPress: () => router.push(`/(app)/medications/${d.medication_id}/log`),
      })
    }

    return list
  }, [refillAlerts, todayDoses])

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([refetchRefills(), refetchDoses()])
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={items.length ? s.list : s.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={item.onPress} accessibilityRole="button" accessibilityLabel={item.title}>
              <View style={[s.iconWrap, { backgroundColor: item.accent + '1A' }]}>
                <Text style={s.icon}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                <Text style={s.subtitle} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          )}
          ListHeaderComponent={items.length ? <Text style={s.countLabel}>{items.length} item{items.length === 1 ? '' : 's'} need your attention</Text> : null}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🎉</Text>
              <Text style={s.emptyTitle}>You’re all caught up</Text>
              <Text style={s.emptyText}>No refill or dose reminders right now.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: Colors.background },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14 },
  backText:    { color: '#fff', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:        { padding: 16, gap: 10 },
  listEmpty:   { flexGrow: 1 },
  countLabel:  { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  card:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border },
  iconWrap:    { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  icon:        { fontSize: 20 },
  title:       { fontSize: 15, fontWeight: '700', color: Colors.text },
  subtitle:    { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  chevron:     { fontSize: 22, color: Colors.textMuted, fontWeight: '300' },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon:   { fontSize: 44, marginBottom: 12 },
  emptyTitle:  { fontSize: 17, fontWeight: '800', color: Colors.text },
  emptyText:   { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
})
