import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useMedicationsStore } from '@/hooks/useMedications'
import { calcAdherence, formatDate, formatTime } from '@vitatrack/shared'
import type { DoseStatus } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const { fetchMedications, fetchDoseHistory, updateMedication } = useMedicationsStore()

  const { data: medications = [], refetch } = useQuery({
    queryKey: ['medications'],
    queryFn: fetchMedications,
  })
  const med = medications.find(m => m.id === id)

  const { data: history = [] } = useQuery({
    queryKey: ['dose-history', id],
    queryFn: () => fetchDoseHistory(id, 30),
    enabled: !!id,
  })

  const adherence = calcAdherence(history, 30)

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const toggleActive = () => {
    if (!med) return
    const archiving = med.is_active
    Alert.alert(
      archiving ? 'Archive medication?' : 'Reactivate medication?',
      archiving
        ? `${med.name} will move to Inactive and stop generating reminders.`
        : `${med.name} will become active again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: archiving ? 'Archive' : 'Reactivate',
          style: archiving ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true)
            const err = await updateMedication(med.id, { is_active: !med.is_active })
            setBusy(false)
            if (err) Alert.alert('Error', err)
            else await refetch()
          },
        },
      ],
    )
  }

  if (!med) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <DetailHeader title="Medication" />
        <View style={s.center}><Text style={s.errorMsg}>Medication not found.</Text></View>
      </SafeAreaView>
    )
  }

  const sched = med.schedules?.[0]
  const isLow = med.pill_count !== null && med.refill_threshold !== null && med.pill_count <= med.refill_threshold
  const subtitle = [
    med.strength ? `${med.strength}${med.strength_unit ?? ''}` : null,
    med.form,
  ].filter(Boolean).join(' · ')

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <DetailHeader title={med.name} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={[s.heroBar, { backgroundColor: med.color ?? Colors.primary }]} />
          <View style={s.heroBody}>
            <Text style={s.heroName}>{med.name}</Text>
            {!!subtitle && <Text style={s.heroSub}>{subtitle}</Text>}
            <View style={[s.statusPill, med.is_active ? s.statusActive : s.statusInactive]}>
              <Text style={[s.statusPillText, { color: med.is_active ? Colors.success : Colors.textSecondary }]}>
                {med.is_active ? '● Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>

        {/* Adherence */}
        {history.length > 0 && (
          <Section title="Adherence · last 30 days">
            <View style={s.adherenceRow}>
              <Text style={[s.adherenceRate, { color: adherence.color }]}>{adherence.rate}%</Text>
              <View style={{ flex: 1 }}>
                <View style={s.adherenceBar}>
                  <View style={[s.adherenceFill, { width: `${adherence.rate}%`, backgroundColor: adherence.color }]} />
                </View>
                <Text style={s.metaText}>{adherence.taken}/{adherence.total} taken · {adherence.streak}-day streak</Text>
              </View>
            </View>
          </Section>
        )}

        {/* Supply */}
        {med.pill_count !== null && (
          <Section title="Supply">
            <View style={s.rowBetween}>
              <Text style={s.supplyCount}>{med.pill_count} <Text style={s.supplyUnit}>left</Text></Text>
              {isLow && <View style={s.lowBadge}><Text style={s.lowBadgeText}>Low — refill soon</Text></View>}
            </View>
            {med.refill_threshold !== null && (
              <Text style={s.metaText}>Refill reminder at {med.refill_threshold} remaining</Text>
            )}
          </Section>
        )}

        {/* Schedule */}
        <Section title="Schedule">
          {sched ? (
            <>
              <Text style={s.rowValue}>{sched.frequency.replace(/_/g, ' ')}</Text>
              {sched.times?.length ? <Text style={s.metaText}>Times: {sched.times.join(', ')}</Text> : null}
              {sched.reminder_enabled
                ? <Text style={s.metaText}>Reminders on{sched.reminder_minutes_before ? ` · ${sched.reminder_minutes_before} min before` : ''}</Text>
                : <Text style={s.metaText}>Reminders off</Text>}
            </>
          ) : (
            <Text style={s.metaText}>No schedule set</Text>
          )}
        </Section>

        {/* Details */}
        <Section title="Details">
          <DetailRow label="Generic name" value={med.generic_name} />
          <DetailRow label="Prescriber" value={med.prescriber} />
          <DetailRow label="Instructions" value={med.instructions} />
          <DetailRow label="Start date" value={med.start_date ? formatDate(med.start_date) : null} />
          <DetailRow label="End date" value={med.end_date ? formatDate(med.end_date) : null} />
          {!med.generic_name && !med.prescriber && !med.instructions && !med.start_date && !med.end_date && (
            <Text style={s.metaText}>No extra details recorded.</Text>
          )}
        </Section>

        {/* Recent doses */}
        {history.length > 0 && (
          <Section title="Recent doses">
            {history.slice(0, 8).map(h => (
              <View key={h.id} style={s.histRow}>
                <Text style={[s.histDot, { color: doseColor(h.status) }]}>●</Text>
                <Text style={s.histStatus}>{h.status}</Text>
                <Text style={s.histTime}>{formatDate(h.logged_at)} · {formatTime(h.logged_at)}</Text>
              </View>
            ))}
          </Section>
        )}
      </ScrollView>

      {/* Sticky actions */}
      <View style={s.actions}>
        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={toggleActive}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={med.is_active ? 'Archive medication' : 'Reactivate medication'}
        >
          <Text style={s.secondaryBtnText}>{med.is_active ? 'Archive' : 'Reactivate'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => router.push(`/(app)/medications/${med.id}/log`)}
          accessibilityRole="button"
          accessibilityLabel="Log a dose"
        >
          <Text style={s.primaryBtnText}>＋ Log dose</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

/* ─── Pieces ─── */
function DetailHeader({ title }: { title: string }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={s.backText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 60 }} />
    </View>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  )
}

function doseColor(status: DoseStatus): string {
  return status === 'taken'   ? Colors.success
       : status === 'missed'  ? Colors.danger
       : status === 'skipped' ? Colors.warning
       : Colors.textMuted
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: Colors.background },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14 },
  backText:        { color: '#fff', fontSize: 16 },
  headerTitle:     { fontSize: 17, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorMsg:        { color: Colors.danger, fontSize: 16 },
  scroll:          { padding: 16, gap: 14, paddingBottom: 24 },

  hero:            { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  heroBar:         { width: 6 },
  heroBody:        { flex: 1, padding: 18 },
  heroName:        { fontSize: 22, fontWeight: '800', color: Colors.text },
  heroSub:         { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  statusPill:      { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 12 },
  statusActive:    { backgroundColor: Colors.successBg },
  statusInactive:  { backgroundColor: Colors.borderLight },
  statusPillText:  { fontSize: 12, fontWeight: '700' },

  section:         { gap: 8 },
  sectionTitle:    { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 },
  sectionCard:     { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 6 },

  adherenceRow:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  adherenceRate:   { fontSize: 30, fontWeight: '800', width: 76 },
  adherenceBar:    { height: 8, borderRadius: 4, backgroundColor: Colors.borderLight, overflow: 'hidden' },
  adherenceFill:   { height: 8, borderRadius: 4 },

  rowBetween:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  supplyCount:     { fontSize: 24, fontWeight: '800', color: Colors.text },
  supplyUnit:      { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  lowBadge:        { backgroundColor: Colors.warningBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  lowBadgeText:    { color: Colors.warning, fontSize: 12, fontWeight: '700' },

  rowValue:        { fontSize: 16, fontWeight: '700', color: Colors.text, textTransform: 'capitalize' },
  metaText:        { fontSize: 13, color: Colors.textSecondary },

  detailRow:       { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 4 },
  detailLabel:     { fontSize: 13, color: Colors.textSecondary },
  detailValue:     { fontSize: 14, color: Colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  histRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  histDot:         { fontSize: 12 },
  histStatus:      { fontSize: 14, fontWeight: '700', color: Colors.text, textTransform: 'capitalize', width: 70 },
  histTime:        { fontSize: 12, color: Colors.textMuted },

  actions:         { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.card },
  secondaryBtn:    { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  secondaryBtnText:{ fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  primaryBtn:      { flex: 2, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: Colors.primary },
  primaryBtnText:  { fontSize: 15, fontWeight: '800', color: '#fff' },
})
