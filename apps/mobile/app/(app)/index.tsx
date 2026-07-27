import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuthStore } from '@/hooks/useAuth'
import { useMedicationsStore } from '@/hooks/useMedications'
import { useVitalsStore } from '@/hooks/useVitals'
import { Colors } from '@/constants/Colors'
import { formatDate, formatTime, classifyBP } from '@vitatrack/shared'

export default function HomeScreen() {
  const { user } = useAuthStore()
  const [refreshing, setRefreshing] = useState(false)

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const { data: todayDoses, refetch: refetchDoses } = useQuery({
    queryKey: ['today-doses'],
    queryFn: () => useMedicationsStore.getState().fetchTodayDoses(),
  })

  const { data: latestVitals, refetch: refetchVitals } = useQuery({
    queryKey: ['latest-vitals'],
    queryFn: () => useVitalsStore.getState().fetchLatestVitals(),
  })

  const { data: refillAlerts } = useQuery({
    queryKey: ['refill-alerts'],
    queryFn: () => useMedicationsStore.getState().fetchRefillAlerts(),
  })

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([refetchDoses(), refetchVitals()])
    setRefreshing(false)
  }

  const latestBP = latestVitals?.find(v => v.type === 'blood_pressure')
  const latestGlucose = latestVitals?.find(v => v.type === 'glucose')
  const latestWeight = latestVitals?.find(v => v.type === 'weight')

  const bpClass = latestBP?.systolic && latestBP?.diastolic
    ? classifyBP(latestBP.systolic, latestBP.diastolic)
    : null

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting}</Text>
          <Text style={s.name}>{firstName} 👋</Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity style={s.notifBtn} onPress={() => router.push('/(app)/notifications')}>
            <Text style={s.notifIcon}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.avatar} onPress={() => router.push('/(app)/profile')}>
            <Text style={s.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >

        {/* Refill alert banner */}
        {refillAlerts && refillAlerts.length > 0 && (
          <TouchableOpacity style={s.alertBanner} onPress={() => router.push('/(app)/medications')}>
            <Text style={s.alertIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitle}>Low supply: {refillAlerts[0].medication_name}</Text>
              <Text style={s.alertSub}>{refillAlerts[0].pill_count} tablets remaining</Text>
            </View>
            <Text style={s.alertChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Today's doses */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Today's Doses</Text>
            <TouchableOpacity onPress={() => router.push('/(app)/medications')}>
              <Text style={s.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {!todayDoses || todayDoses.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyText}>No doses scheduled today 🎉</Text>
            </View>
          ) : (
            todayDoses.map(dose => (
              <DoseCard
                key={dose.id}
                name={dose.medication?.name ?? ''}
                time={dose.scheduled_at ? formatTime(dose.scheduled_at) : '—'}
                status={dose.status}
                onPress={() => router.push(`/(app)/medications/${dose.medication_id}/log`)}
              />
            ))
          )}
        </View>

        {/* Vitals summary */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Latest Vitals</Text>
            <TouchableOpacity onPress={() => router.push('/(app)/vitals')}>
              <Text style={s.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          <View style={s.vitalsRow}>
            <VitalCard
              icon="❤️"
              label="Blood Pressure"
              value={latestBP ? `${latestBP.systolic}/${latestBP.diastolic}` : '—'}
              unit="mmHg"
              badge={bpClass?.label}
              badgeColor={bpClass?.color}
              onPress={() => router.push('/(app)/vitals?type=blood_pressure')}
            />
            <VitalCard
              icon="🩸"
              label="Glucose"
              value={latestGlucose?.glucose_value?.toFixed(1) ?? '—'}
              unit={latestGlucose?.glucose_unit ?? 'mmol/L'}
              onPress={() => router.push('/(app)/vitals?type=glucose')}
            />
            <VitalCard
              icon="⚖️"
              label="Weight"
              value={latestWeight?.weight_value?.toString() ?? '—'}
              unit={latestWeight?.weight_unit ?? 'kg'}
              onPress={() => router.push('/(app)/vitals?type=weight')}
            />
          </View>
        </View>

        {/* Quick actions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <View style={s.quickRow}>
            <QuickAction icon="💊" label="Log Dose"    onPress={() => router.push('/(app)/medications')} />
            <QuickAction icon="📊" label="Log Vitals"  onPress={() => router.push('/(app)/vitals/add')} />
            <QuickAction icon="📋" label="Add Visit"   onPress={() => router.push('/(app)/records/visit-add')} />
            <QuickAction icon="🆘" label="ICE Profile" onPress={() => router.push('/(app)/ice')} />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-components ────────────────────────────────────────────

function DoseCard({ name, time, status, onPress }: {
  name: string; time: string; status?: string; onPress: () => void
}) {
  const isMissed  = status === 'missed'
  const isTaken   = status === 'taken'
  const isSkipped = status === 'skipped'

  const badge = isTaken   ? { text: 'Taken ✓',   bg: Colors.successBg, color: Colors.success }
              : isMissed  ? { text: 'Missed',     bg: Colors.dangerBg,  color: Colors.danger  }
              : isSkipped ? { text: 'Skipped',    bg: '#FEF3C7',        color: '#92400E'      }
              :             { text: 'Due',         bg: Colors.primaryBg, color: Colors.primary }

  return (
    <TouchableOpacity
      style={[s.doseCard, isMissed && s.doseCardMissed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${time}, ${badge.text}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.doseName}>{name}</Text>
        <Text style={s.doseTime}>{time}</Text>
      </View>
      <View style={[s.doseBadge, { backgroundColor: badge.bg }]}>
        <Text style={[s.doseBadgeText, { color: badge.color }]}>{badge.text}</Text>
      </View>
    </TouchableOpacity>
  )
}

function VitalCard({ icon, label, value, unit, badge, badgeColor, onPress }: {
  icon: string; label: string; value: string; unit: string
  badge?: string; badgeColor?: string; onPress: () => void
}) {
  return (
    <TouchableOpacity style={s.vitalCard} onPress={onPress}>
      <Text style={s.vitalIcon}>{icon}</Text>
      <Text style={s.vitalValue}>{value}</Text>
      <Text style={s.vitalUnit}>{unit}</Text>
      <Text style={s.vitalLabel}>{label}</Text>
      {badge && <Text style={[s.vitalBadge, { color: badgeColor }]}>{badge}</Text>}
    </TouchableOpacity>
  )
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.quickAction} onPress={onPress} accessibilityRole="button">
      <Text style={s.quickIcon}>{icon}</Text>
      <Text style={s.quickLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: Colors.background },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 16 },
  greeting:       { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  name:           { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 2 },
  headerActions:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  notifIcon:      { fontSize: 18 },
  avatar:         { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 18, fontWeight: '800', color: '#fff' },
  scroll:         { flex: 1 },
  scrollContent:  { padding: 16, gap: 16, paddingBottom: 24 },
  alertBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#FDE68A', gap: 10 },
  alertIcon:      { fontSize: 20 },
  alertTitle:     { fontSize: 14, fontWeight: '700', color: '#92400E' },
  alertSub:       { fontSize: 12, color: '#B45309', marginTop: 2 },
  alertChevron:   { fontSize: 20, color: '#92400E' },
  section:        { gap: 10 },
  sectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle:   { fontSize: 16, fontWeight: '800', color: Colors.text },
  seeAll:         { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  emptyCard:      { backgroundColor: Colors.card, borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  emptyText:      { fontSize: 14, color: Colors.textSecondary },
  doseCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  doseCardMissed: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  doseName:       { fontSize: 15, fontWeight: '700', color: Colors.text },
  doseTime:       { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  doseBadge:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  doseBadgeText:  { fontSize: 11, fontWeight: '700' },
  vitalsRow:      { flexDirection: 'row', gap: 10 },
  vitalCard:      { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  vitalIcon:      { fontSize: 22, marginBottom: 4 },
  vitalValue:     { fontSize: 18, fontWeight: '800', color: Colors.primary },
  vitalUnit:      { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  vitalLabel:     { fontSize: 10, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
  vitalBadge:     { fontSize: 9, fontWeight: '700', marginTop: 3 },
  quickRow:       { flexDirection: 'row', gap: 10 },
  quickAction:    { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  quickIcon:      { fontSize: 26, marginBottom: 6 },
  quickLabel:     { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
})
