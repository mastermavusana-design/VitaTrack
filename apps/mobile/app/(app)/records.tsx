import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useQuery } from '@tanstack/react-query'
import { useRecordsStore } from '@/hooks/useRecords'
import { formatDate } from '@vitatrack/shared'
import type { DoctorVisit, HealthDocument } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'

type RecordsTab = 'visits' | 'documents'
type DocCategory = 'all' | 'lab_result' | 'prescription' | 'imaging' | 'report' | 'other'

const DOC_CATEGORIES: { key: DocCategory; label: string; icon: string }[] = [
  { key: 'all',          label: 'All',          icon: '📁' },
  { key: 'lab_result',   label: 'Lab Results',  icon: '🔬' },
  { key: 'prescription', label: 'Rx',           icon: '💊' },
  { key: 'imaging',      label: 'Imaging',      icon: '🩻' },
  { key: 'report',       label: 'Reports',      icon: '📋' },
  { key: 'other',        label: 'Other',        icon: '📎' },
]

export default function RecordsScreen() {
  const [activeTab, setActiveTab] = useState<RecordsTab>('visits')
  const [docCategory, setDocCategory] = useState<DocCategory>('all')
  const [refreshing, setRefreshing] = useState(false)
  const { fetchVisits, fetchDocuments } = useRecordsStore()

  const { data: visits = [], refetch: refetchVisits } = useQuery({
    queryKey: ['visits'],
    queryFn: fetchVisits,
  })

  const { data: documents = [], refetch: refetchDocs } = useQuery({
    queryKey: ['documents', docCategory],
    queryFn: () => fetchDocuments(docCategory),
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([refetchVisits(), refetchDocs()])
    setRefreshing(false)
  }, [refetchVisits, refetchDocs])

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>📂 Records</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => router.push('/(app)/records/visit-add')}
        >
          <Text style={s.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Tab switcher */}
      <View style={s.tabSwitcher}>
        <TouchableOpacity
          style={[s.switchTab, activeTab === 'visits' && s.switchTabActive]}
          onPress={() => setActiveTab('visits')}
        >
          <Text style={[s.switchTabText, activeTab === 'visits' && s.switchTabTextActive]}>
            🏥 Visits ({visits.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.switchTab, activeTab === 'documents' && s.switchTabActive]}
          onPress={() => setActiveTab('documents')}
        >
          <Text style={[s.switchTabText, activeTab === 'documents' && s.switchTabTextActive]}>
            📄 Documents ({documents.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'visits' ? (
        <FlatList
          data={visits}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <VisitCard visit={item} />}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={<EmptyState icon="🏥" message="No visits recorded yet." sub="Log your first doctor visit to keep your medical history in one place." />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <>
          {/* Category filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.catBar}
            contentContainerStyle={s.catContent}
          >
            {DOC_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={[s.catChip, docCategory === cat.key && s.catChipActive]}
                onPress={() => setDocCategory(cat.key)}
              >
                <Text style={s.catIcon}>{cat.icon}</Text>
                <Text style={[s.catText, docCategory === cat.key && s.catTextActive]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={documents}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <DocumentCard doc={item} />}
            contentContainerStyle={s.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            ListEmptyComponent={<EmptyState icon="📄" message="No documents yet." sub="Upload lab results, prescriptions, or imaging reports." />}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <TouchableOpacity style={s.fab} onPress={() => router.push('/(app)/records/visit-add')}>
        <Text style={s.fabText}>＋ Log Visit</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

function VisitCard({ visit }: { visit: DoctorVisit }) {
  const typeColors: Record<string, { bg: string; text: string }> = {
    gp:         { bg: Colors.primaryBg, text: Colors.primary },
    specialist:  { bg: Colors.successBg, text: Colors.success },
    emergency:   { bg: Colors.dangerBg,  text: Colors.danger },
    dentist:     { bg: Colors.warningBg, text: Colors.warning },
    other:       { bg: '#F3F4F6',        text: '#6B7280' },
  }
  const tc = typeColors[visit.visit_type ?? 'other'] ?? typeColors.other

  return (
    <TouchableOpacity style={s.visitCard} activeOpacity={0.8}>
      <View style={s.visitDateBlock}>
        <Text style={s.visitMonth}>{new Date(visit.visit_date).toLocaleString('default', { month: 'short' }).toUpperCase()}</Text>
        <Text style={s.visitDay}>{new Date(visit.visit_date).getDate()}</Text>
        <Text style={s.visitYear}>{new Date(visit.visit_date).getFullYear()}</Text>
      </View>

      <View style={s.visitBody}>
        <View style={s.visitTitleRow}>
          <Text style={s.visitProvider} numberOfLines={1}>{visit.provider_name}</Text>
          <View style={[s.visitTypeBadge, { backgroundColor: tc.bg }]}>
            <Text style={[s.visitTypeText, { color: tc.text }]}>
              {(visit.visit_type ?? 'other').replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {visit.facility && (
          <Text style={s.visitFacility} numberOfLines={1}>🏥 {visit.facility}</Text>
        )}

        {visit.reason && (
          <Text style={s.visitReason} numberOfLines={2}>{visit.reason}</Text>
        )}

        {visit.follow_up_date && (
          <View style={s.followUpRow}>
            <Text style={s.followUpText}>📅 Follow-up: {formatDate(visit.follow_up_date)}</Text>
          </View>
        )}

        {(visit as any).documents?.length > 0 && (
          <Text style={s.docsAttached}>📎 {(visit as any).documents.length} document{(visit as any).documents.length > 1 ? 's' : ''}</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

function DocumentCard({ doc }: { doc: HealthDocument }) {
  const { getSignedUrl } = useRecordsStore()
  const [isOpening, setIsOpening] = useState(false)

  const catMeta: Record<string, { icon: string; color: string }> = {
    lab_result:   { icon: '🔬', color: Colors.primary },
    prescription: { icon: '💊', color: Colors.success },
    imaging:      { icon: '🩻', color: Colors.warning },
    report:       { icon: '📋', color: '#8B5CF6' },
    other:        { icon: '📎', color: Colors.textMuted },
  }
  const meta = catMeta[doc.category] ?? catMeta.other
  const fileExt = doc.file_name.split('.').pop()?.toUpperCase() ?? 'FILE'

  const openDocument = async () => {
    setIsOpening(true)
    const url = await getSignedUrl((doc as any).storage_path)
    setIsOpening(false)
    if (!url) {
      Alert.alert('Error', 'Could not generate a download link. Please try again.')
      return
    }
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    })
  }

  return (
    <TouchableOpacity style={s.docCard} activeOpacity={0.8} onPress={openDocument}>
      <View style={[s.docIconWrap, { backgroundColor: Colors.primaryBg }]}>
        <Text style={s.docIcon}>{meta.icon}</Text>
        <Text style={s.docExt}>{fileExt}</Text>
      </View>

      <View style={s.docBody}>
        <Text style={s.docName} numberOfLines={1}>{doc.file_name}</Text>
        <Text style={s.docMeta}>{doc.category.replace('_', ' ')} · {formatDate(doc.created_at)}</Text>
        {doc.notes && <Text style={s.docNotes} numberOfLines={1}>{doc.notes}</Text>}
      </View>

      {isOpening
        ? <ActivityIndicator size="small" color={Colors.primary} />
        : <Text style={s.docChevron}>›</Text>
      }
    </TouchableOpacity>
  )
}

function EmptyState({ icon, message, sub }: { icon: string; message: string; sub: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyMsg}>{message}</Text>
      <Text style={s.emptySub}>{sub}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: Colors.background },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle:      { fontSize: 18, fontWeight: '800', color: '#fff' },
  addBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  addBtnText:       { fontSize: 22, color: '#fff' },
  tabSwitcher:      { flexDirection: 'row', backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  switchTab:        { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  switchTabActive:  { borderBottomColor: Colors.primary },
  switchTabText:    { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  switchTabTextActive: { color: Colors.primary },
  catBar:           { backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  catContent:       { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  catChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  catChipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catIcon:          { fontSize: 13 },
  catText:          { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  catTextActive:    { color: '#fff' },
  list:             { padding: 16, gap: 10, paddingBottom: 96 },

  visitCard:        { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', gap: 0 },
  visitDateBlock:   { width: 64, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  visitMonth:       { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5 },
  visitDay:         { fontSize: 26, fontWeight: '900', color: '#fff', lineHeight: 28 },
  visitYear:        { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  visitBody:        { flex: 1, padding: 14, gap: 3 },
  visitTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  visitProvider:    { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.text },
  visitTypeBadge:   { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  visitTypeText:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  visitFacility:    { fontSize: 12, color: Colors.textSecondary },
  visitReason:      { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginTop: 2 },
  followUpRow:      { backgroundColor: Colors.warningBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4, alignSelf: 'flex-start' },
  followUpText:     { fontSize: 11, color: Colors.warning, fontWeight: '600' },
  docsAttached:     { fontSize: 11, color: Colors.primary, marginTop: 4 },

  docCard:          { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12 },
  docIconWrap:      { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docIcon:          { fontSize: 20 },
  docExt:           { fontSize: 8, fontWeight: '800', color: Colors.primary, marginTop: 1 },
  docBody:          { flex: 1, gap: 2 },
  docName:          { fontSize: 14, fontWeight: '700', color: Colors.text },
  docMeta:          { fontSize: 11, color: Colors.textSecondary, textTransform: 'capitalize' },
  docNotes:         { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  docChevron:       { fontSize: 20, color: Colors.textMuted },

  empty:            { padding: 48, alignItems: 'center', gap: 8 },
  emptyIcon:        { fontSize: 40 },
  emptyMsg:         { fontSize: 16, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  emptySub:         { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  fab:              { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  fabText:          { color: '#fff', fontSize: 16, fontWeight: '700' },
})
