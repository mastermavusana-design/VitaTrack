import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ageInDays } from '@vitatrack/shared'
import type { Immunisation, Milestone } from '@vitatrack/shared'
import { useChildrenStore } from '@/hooks/useChildren'
import ChildGrowthChart, { GROWTH_INDICATORS, type IndicatorKey } from '@/components/ChildGrowthChart'
import { Colors } from '@/constants/Colors'

const today = () => new Date().toISOString().slice(0, 10)

function formatAge(dobISO: string): string {
  const days = ageInDays(dobISO, today())
  if (days < 0) return '—'
  const totalMonths = Math.floor(days / 30.4375)
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years === 0) return `${totalMonths} mo`
  if (months === 0) return `${years} yr`
  return `${years} yr ${months} mo`
}

type Tab = 'immunisations' | 'growth' | 'milestones'

export default function ChildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { fetchChildBundle, updateImmunisation, updateMilestone } = useChildrenStore()

  const [tab, setTab] = useState<Tab>('immunisations')
  const [indicator, setIndicator] = useState<IndicatorKey>('wfa')
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['child-bundle', id],
    queryFn: () => fetchChildBundle(id),
    enabled: !!id,
  })

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false) }

  async function immAction(row: Immunisation, patch: Partial<Immunisation>) {
    setBusyId(row.id)
    await updateImmunisation(row.id, patch)
    await refetch()
    setBusyId(null)
  }
  async function mileAction(row: Milestone, patch: Partial<Milestone>) {
    setBusyId(row.id)
    await updateMilestone(row.id, patch)
    await refetch()
    setBusyId(null)
  }

  const dependant = data?.dependant ?? null
  const immunisations = data?.immunisations ?? []
  const measurements = data?.measurements ?? []
  const milestones = data?.milestones ?? []

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Text style={s.backText}>‹ Children</Text></TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{dependant?.full_name ?? 'Child'}</Text>
        <View style={{ width: 64 }} />
      </View>

      {isLoading && !data ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : !dependant ? (
        <View style={s.center}><Text style={s.muted}>This child could not be found, or you don&apos;t have access.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          <Text style={s.subhead}>
            {formatAge(dependant.date_of_birth)}
            {dependant.sex ? ` · ${dependant.sex === 'male' ? 'Boy' : 'Girl'}` : ''}
            {dependant.rthb_number ? ` · RtHB ${dependant.rthb_number}` : ''}
          </Text>

          {/* Tabs */}
          <View style={s.tabs}>
            {(['immunisations', 'growth', 'milestones'] as Tab[]).map(t => (
              <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
                <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                  {t === 'immunisations' ? `Shots (${immunisations.length})` : t === 'growth' ? `Growth (${measurements.length})` : `Milestones (${milestones.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Immunisations */}
          {tab === 'immunisations' && (
            <View style={s.card}>
              {immunisations.length === 0 ? <Empty text="No immunisations scheduled yet." /> : immunisations.map((i, idx) => (
                <View key={i.id} style={[s.rowItem, idx > 0 && s.rowBorderTop]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{i.vaccine_name}</Text>
                    <Text style={s.rowSub}>
                      {i.dose_label ?? '—'}{i.due_date ? ` · due ${i.due_date}` : ''}{i.given_date ? ` · given ${i.given_date}` : ''}
                    </Text>
                    <StatusPill status={i.status} />
                  </View>
                  <View style={s.actions}>
                    {i.status !== 'given' && (
                      <ActionBtn label="Given" primary busy={busyId === i.id} onPress={() => immAction(i, { status: 'given', given_date: today() })} />
                    )}
                    {i.status === 'due' && (
                      <ActionBtn label="Skip" busy={busyId === i.id} onPress={() => immAction(i, { status: 'skipped', given_date: null })} />
                    )}
                    {i.status !== 'due' && (
                      <ActionBtn label="Undo" ghost busy={busyId === i.id} onPress={() => immAction(i, { status: 'due', given_date: null })} />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Growth */}
          {tab === 'growth' && (
            <View>
              <View style={s.indicatorRow}>
                {(Object.keys(GROWTH_INDICATORS) as IndicatorKey[]).map(k => (
                  <TouchableOpacity key={k} style={[s.chip, indicator === k && s.chipActive]} onPress={() => setIndicator(k)}>
                    <Text style={[s.chipText, indicator === k && s.chipTextActive]}>{GROWTH_INDICATORS[k].short}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={s.addMeasureBtn} onPress={() => router.push(`/(app)/children/${id}/measure`)}>
                  <Text style={s.addMeasureText}>＋ Measurement</Text>
                </TouchableOpacity>
              </View>

              <View style={s.chartCard}>
                <ChildGrowthChart sex={dependant.sex} dob={dependant.date_of_birth} measurements={measurements} indicator={indicator} />
              </View>

              {measurements.length > 0 && (
                <View style={s.card}>
                  {[...measurements].reverse().map((m, idx) => (
                    <View key={m.id} style={[s.measureRow, idx > 0 && s.rowBorderTop]}>
                      <Text style={s.measureDate}>{m.measured_at}</Text>
                      <Text style={s.measureVals}>
                        {[m.weight_kg != null ? `${m.weight_kg} kg` : null,
                          m.length_cm != null ? `${m.length_cm} cm` : null,
                          m.head_circ_cm != null ? `HC ${m.head_circ_cm}` : null,
                          m.muac_cm != null ? `MUAC ${m.muac_cm}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Milestones */}
          {tab === 'milestones' && (
            <View style={s.card}>
              {milestones.length === 0 ? <Empty text="No milestones tracked yet." /> : milestones.map((m, idx) => (
                <View key={m.id} style={[s.rowItem, idx > 0 && s.rowBorderTop]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{m.milestone}</Text>
                    <Text style={s.rowSub}>
                      {m.domain ?? '—'}{m.expected_age_band ? ` · ${m.expected_age_band}` : ''}{m.achieved_on ? ` · ${m.achieved_on}` : ''}
                    </Text>
                    <StatusPill status={m.status} />
                  </View>
                  <View style={s.actions}>
                    {m.status !== 'achieved' && (
                      <ActionBtn label="✓" primary busy={busyId === m.id} onPress={() => mileAction(m, { status: 'achieved', achieved_on: today() })} />
                    )}
                    {m.status !== 'concern' && (
                      <ActionBtn label="!" busy={busyId === m.id} onPress={() => mileAction(m, { status: 'concern', achieved_on: null })} />
                    )}
                    {m.status !== 'not_yet' && (
                      <ActionBtn label="↺" ghost busy={busyId === m.id} onPress={() => mileAction(m, { status: 'not_yet', achieved_on: null })} />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function ActionBtn({ label, onPress, primary, ghost, busy }: { label: string; onPress: () => void; primary?: boolean; ghost?: boolean; busy?: boolean }) {
  return (
    <TouchableOpacity
      disabled={busy}
      onPress={onPress}
      style={[s.actionBtn, primary && s.actionPrimary, ghost && s.actionGhost, busy && { opacity: 0.5 }]}
    >
      <Text style={[s.actionText, primary && s.actionTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    due:             { bg: Colors.warningBg, fg: Colors.warning },
    given:           { bg: Colors.successBg, fg: Colors.success },
    skipped:         { bg: Colors.borderLight, fg: Colors.textMuted },
    contraindicated: { bg: Colors.dangerBg, fg: Colors.danger },
    not_yet:         { bg: Colors.borderLight, fg: Colors.textMuted },
    achieved:        { bg: Colors.successBg, fg: Colors.success },
    concern:         { bg: Colors.dangerBg, fg: Colors.danger },
  }
  const c = map[status] ?? { bg: Colors.borderLight, fg: Colors.textMuted }
  return (
    <View style={[s.pill, { backgroundColor: c.bg, alignSelf: 'flex-start', marginTop: 6 }]}>
      <Text style={[s.pillText, { color: c.fg }]}>{status.replace('_', ' ')}</Text>
    </View>
  )
}

function Empty({ text }: { text: string }) {
  return <Text style={s.emptyText}>{text}</Text>
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.background },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14 },
  backBtn:       { width: 64 },
  backText:      { color: '#fff', fontSize: 15 },
  headerTitle:   { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#fff' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted:         { color: Colors.textSecondary, fontSize: 14, textAlign: 'center' },
  scroll:        { padding: 16 },
  subhead:       { fontSize: 13, color: Colors.textSecondary, marginBottom: 14 },
  tabs:          { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tab:           { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  tabActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:       { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  card:          { backgroundColor: Colors.card, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.border },
  rowItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  rowBorderTop:  { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  rowTitle:      { fontSize: 14, fontWeight: '700', color: Colors.text },
  rowSub:        { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  actions:       { flexDirection: 'row', gap: 6 },
  actionBtn:     { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  actionPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionGhost:   { backgroundColor: 'transparent', borderColor: 'transparent' },
  actionText:    { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  actionTextPrimary: { color: '#fff' },
  pill:          { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  pillText:      { fontSize: 11, fontWeight: '700' },
  indicatorRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip:          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.border },
  chipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:      { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive:{ color: '#fff' },
  addMeasureBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: Colors.primaryBg },
  addMeasureText:{ fontSize: 12, fontWeight: '700', color: Colors.primary },
  chartCard:     { backgroundColor: Colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 12, alignItems: 'center' },
  measureRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, gap: 12 },
  measureDate:   { fontSize: 12, color: Colors.textMuted },
  measureVals:   { fontSize: 12, color: Colors.text, flex: 1, textAlign: 'right' },
  emptyText:     { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 24 },
})
