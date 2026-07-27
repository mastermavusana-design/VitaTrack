import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { useRecordsStore } from '@/hooks/useRecords'
import { Colors } from '@/constants/Colors'

type VisitType = 'gp' | 'specialist' | 'emergency' | 'dentist' | 'pharmacy' | 'other'
type DocCategory = 'lab_result' | 'prescription' | 'imaging' | 'report' | 'other'

const VISIT_TYPES: { value: VisitType; label: string; icon: string }[] = [
  { value: 'gp',         label: 'GP',         icon: '👨‍⚕️' },
  { value: 'specialist', label: 'Specialist',  icon: '🔬' },
  { value: 'emergency',  label: 'Emergency',   icon: '🚑' },
  { value: 'dentist',    label: 'Dentist',     icon: '🦷' },
  { value: 'pharmacy',   label: 'Pharmacy',    icon: '💊' },
  { value: 'other',      label: 'Other',       icon: '🏥' },
]

const DOC_CATEGORIES: { value: DocCategory; label: string }[] = [
  { value: 'lab_result',   label: 'Lab Result' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'imaging',      label: 'Imaging' },
  { value: 'report',       label: 'Report' },
  { value: 'other',        label: 'Other' },
]

type AttachedDoc = {
  uri: string
  name: string
  type: string
  category: DocCategory
  notes: string
}

export default function VisitAddScreen() {
  const [isSaving, setIsSaving] = useState(false)
  const { addVisit, uploadDocument } = useRecordsStore()

  // Visit fields
  const [visitType, setVisitType] = useState<VisitType>('gp')
  const [provider, setProvider]   = useState('')
  const [facility, setFacility]   = useState('')
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason]       = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes]         = useState('')
  const [followUp, setFollowUp]   = useState('')

  // Documents to attach
  const [attachedDocs, setAttachedDocs] = useState<AttachedDoc[]>([])
  const [pickerError, setPickerError]   = useState<string | null>(null)

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        setAttachedDocs(prev => [
          ...prev,
          {
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType ?? 'application/octet-stream',
            category: 'other',
            notes: '',
          },
        ])
      }
    } catch (e) {
      setPickerError('Could not pick document. Try again.')
    }
  }

  const removeDoc = (idx: number) => {
    setAttachedDocs(prev => prev.filter((_, i) => i !== idx))
  }

  const updateDocField = (idx: number, field: keyof AttachedDoc, value: string) => {
    setAttachedDocs(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  const handleSave = async () => {
    if (!provider.trim()) {
      Alert.alert('Required', 'Provider name is required.')
      return
    }
    if (!visitDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Invalid Date', 'Date must be YYYY-MM-DD format.')
      return
    }

    setIsSaving(true)

    const err = await addVisit({
      visit_type: visitType,
      provider_name: provider.trim(),
      facility: facility.trim() || null,
      visit_date: visitDate,
      reason: reason.trim() || null,
      diagnosis: diagnosis.trim() || null,
      notes: notes.trim() || null,
      follow_up_date: followUp.trim() || null,
    } as any)

    if (err) {
      setIsSaving(false)
      Alert.alert('Error', err)
      return
    }

    // Upload documents (best-effort after visit saved)
    for (const doc of attachedDocs) {
      await uploadDocument(null, { uri: doc.uri, name: doc.name, type: doc.type }, doc.category, doc.notes || undefined)
    }

    setIsSaving(false)
    router.back()
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.backText}>‹ Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Log Visit</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving} style={s.saveBtn}>
          {isSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Visit type */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Visit Type</Text>
            <View style={s.chipGrid}>
              {VISIT_TYPES.map(t => (
                <TouchableOpacity
                  key={t.value}
                  style={[s.typeChip, visitType === t.value && s.typeChipActive]}
                  onPress={() => setVisitType(t.value)}
                >
                  <Text style={s.typeChipIcon}>{t.icon}</Text>
                  <Text style={[s.typeChipText, visitType === t.value && s.typeChipTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Core details */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Visit Details</Text>

            <Text style={s.label}>Provider / Doctor *</Text>
            <TextInput
              style={s.input}
              placeholder="Dr Jane Smith"
              placeholderTextColor="#aaa"
              value={provider}
              onChangeText={setProvider}
            />

            <Text style={s.label}>Facility / Hospital</Text>
            <TextInput
              style={s.input}
              placeholder="Mediclinic Sandton"
              placeholderTextColor="#aaa"
              value={facility}
              onChangeText={setFacility}
            />

            <Text style={s.label}>Date (YYYY-MM-DD) *</Text>
            <TextInput
              style={s.input}
              placeholder={new Date().toISOString().split('T')[0]}
              placeholderTextColor="#aaa"
              value={visitDate}
              onChangeText={setVisitDate}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          {/* Clinical details */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Clinical Notes</Text>

            <Text style={s.label}>Reason for Visit</Text>
            <TextInput
              style={[s.input, s.multiline]}
              placeholder="Follow-up for hypertension management"
              placeholderTextColor="#aaa"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            <Text style={s.label}>Diagnosis / Assessment</Text>
            <TextInput
              style={[s.input, s.multiline]}
              placeholder="Stage 1 hypertension, well controlled"
              placeholderTextColor="#aaa"
              value={diagnosis}
              onChangeText={setDiagnosis}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            <Text style={s.label}>Notes</Text>
            <TextInput
              style={[s.input, s.multiline]}
              placeholder="Instructions, things to remember…"
              placeholderTextColor="#aaa"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={s.label}>Follow-up Date (YYYY-MM-DD)</Text>
            <TextInput
              style={s.input}
              placeholder="2026-07-15"
              placeholderTextColor="#aaa"
              value={followUp}
              onChangeText={setFollowUp}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          {/* Document attachments */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Attach Documents</Text>
            <Text style={s.sectionSub}>PDF or images (lab results, prescriptions, imaging)</Text>

            {attachedDocs.map((doc, idx) => (
              <View key={idx} style={s.attachedDoc}>
                <View style={s.attachedDocHeader}>
                  <Text style={s.attachedDocName} numberOfLines={1}>📎 {doc.name}</Text>
                  <TouchableOpacity onPress={() => removeDoc(idx)}>
                    <Text style={s.removeDoc}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[s.label, { marginTop: 8 }]}>Category</Text>
                <View style={s.chipRow}>
                  {DOC_CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c.value}
                      style={[s.catChip, doc.category === c.value && s.catChipActive]}
                      onPress={() => updateDocField(idx, 'category', c.value)}
                    >
                      <Text style={[s.catChipText, doc.category === c.value && s.catChipTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[s.label, { marginTop: 8 }]}>Notes</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Fasting lipogram"
                  placeholderTextColor="#aaa"
                  value={doc.notes}
                  onChangeText={v => updateDocField(idx, 'notes', v)}
                />
              </View>
            ))}

            {pickerError && <Text style={s.errorText}>{pickerError}</Text>}

            <TouchableOpacity style={s.attachBtn} onPress={pickDocument}>
              <Text style={s.attachBtnText}>📎 Add Document</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.saveFullBtn, isSaving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveFullBtnText}>Save Visit</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: Colors.background },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14 },
  backText:          { color: '#fff', fontSize: 16 },
  headerTitle:       { fontSize: 17, fontWeight: '800', color: '#fff' },
  saveBtn:           { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  saveText:          { color: '#fff', fontSize: 15, fontWeight: '700' },
  scroll:            { padding: 16, gap: 12, paddingBottom: 40 },
  section:           { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  sectionTitle:      { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  sectionSub:        { fontSize: 12, color: Colors.textMuted, marginBottom: 4, marginTop: -4 },
  label:             { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  input:             { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  multiline:         { minHeight: 60, textAlignVertical: 'top' },
  chipGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  typeChipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipIcon:      { fontSize: 15 },
  typeChipText:      { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  typeChipTextActive:{ color: '#fff' },
  catChip:           { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  catChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText:       { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  catChipTextActive: { color: '#fff' },
  attachedDoc:       { backgroundColor: Colors.primaryBg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#93C5FD' },
  attachedDocHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attachedDocName:   { fontSize: 13, fontWeight: '600', color: Colors.primary, flex: 1 },
  removeDoc:         { color: Colors.danger, fontSize: 16, paddingLeft: 8 },
  attachBtn:         { backgroundColor: Colors.background, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed' },
  attachBtnText:     { fontSize: 14, fontWeight: '700', color: Colors.primary },
  errorText:         { color: Colors.danger, fontSize: 12 },
  saveFullBtn:       { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  saveFullBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
})
