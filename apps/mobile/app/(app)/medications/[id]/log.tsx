import { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useMedicationsStore } from '@/hooks/useMedications'
import { Colors } from '@/constants/Colors'
import { DOSE_EDIT_WINDOW_HOURS } from '@vitatrack/shared'
import type { DoseStatus } from '@vitatrack/shared'

export default function LogDoseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [status, setStatus] = useState<DoseStatus | null>(null)
  const [notes, setNotes] = useState('')
  const [isLogging, setIsLogging] = useState(false)
  const { medications, logDose } = useMedicationsStore()

  const medication = medications.find(m => m.id === id)

  const handleLog = async () => {
    if (!status || !id) return
    setIsLogging(true)

    const err = await logDose({
      medication_id: id,
      status,
      scheduled_at: new Date().toISOString(),
      notes: notes.trim() || undefined,
    })

    setIsLogging(false)

    if (err) {
      Alert.alert('Error', err)
      return
    }

    router.back()
  }

  if (!medication) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}>
          <Text style={s.errorMsg}>Medication not found.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Log Dose</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Medication summary card */}
        <View style={s.medCard}>
          <View style={[s.medColorBar, { backgroundColor: medication.color ?? Colors.primary }]} />
          <View style={s.medCardBody}>
            <Text style={s.medName}>{medication.name}</Text>
            {medication.strength && (
              <Text style={s.medSub}>{medication.strength}{medication.strength_unit} · {medication.form}</Text>
            )}
            <Text style={s.medTime}>Scheduled: {new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
          </View>
        </View>

        {/* Status selection */}
        <Text style={s.sectionLabel}>Record this dose as</Text>

        <TouchableOpacity
          style={[s.statusBtn, s.statusBtnTaken, status === 'taken' && s.statusBtnSelected]}
          onPress={() => setStatus('taken')}
          accessibilityRole="radio"
          accessibilityState={{ checked: status === 'taken' }}
        >
          <Text style={s.statusBtnIcon}>✓</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusBtnText, { color: Colors.success }]}>Taken</Text>
            <Text style={s.statusBtnSub}>Mark as taken right now</Text>
          </View>
          {status === 'taken' && <Text style={s.checkmark}>●</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.statusBtn, s.statusBtnSkipped, status === 'skipped' && s.statusBtnSelected]}
          onPress={() => setStatus('skipped')}
          accessibilityRole="radio"
          accessibilityState={{ checked: status === 'skipped' }}
        >
          <Text style={s.statusBtnIcon}>⏭</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusBtnText, { color: Colors.warning }]}>Skipped</Text>
            <Text style={s.statusBtnSub}>Intentionally skipping this dose</Text>
          </View>
          {status === 'skipped' && <Text style={[s.checkmark, { color: Colors.warning }]}>●</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.statusBtn, s.statusBtnMissed, status === 'missed' && s.statusBtnSelected]}
          onPress={() => setStatus('missed')}
          accessibilityRole="radio"
          accessibilityState={{ checked: status === 'missed' }}
        >
          <Text style={s.statusBtnIcon}>✕</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusBtnText, { color: Colors.danger }]}>Missed</Text>
            <Text style={s.statusBtnSub}>I forgot or was unable to take it</Text>
          </View>
          {status === 'missed' && <Text style={[s.checkmark, { color: Colors.danger }]}>●</Text>}
        </TouchableOpacity>

        {/* Pill count info */}
        {status === 'taken' && medication.pill_count !== null && (
          <View style={s.pillCountInfo}>
            <Text style={s.pillCountLabel}>Remaining after this dose</Text>
            <Text style={s.pillCountValue}>{Math.max(0, medication.pill_count - 1)} tablets</Text>
          </View>
        )}

        {/* Notes */}
        <Text style={s.sectionLabel}>Note (optional)</Text>
        <TextInput
          style={s.notesInput}
          placeholder="e.g. Took with food, felt nauseous..."
          placeholderTextColor="#aaa"
          multiline
          value={notes}
          onChangeText={setNotes}
          accessibilityLabel="Dose note"
        />

        {/* Time edit hint */}
        <Text style={s.timeHint}>
          Time is auto-captured. You can edit it within {DOSE_EDIT_WINDOW_HOURS} hours via the dose history.
        </Text>

        {/* Confirm button */}
        <TouchableOpacity
          style={[s.confirmBtn, !status && s.confirmBtnDisabled]}
          onPress={handleLog}
          disabled={!status || isLogging}
          accessibilityRole="button"
          accessibilityLabel="Confirm dose"
        >
          {isLogging
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.confirmBtnText}>
                {status ? `Confirm — ${status.charAt(0).toUpperCase() + status.slice(1)}` : 'Select a status above'}
              </Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: Colors.background },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorMsg:          { color: Colors.danger, fontSize: 16 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14 },
  backText:          { color: '#fff', fontSize: 16 },
  headerTitle:       { fontSize: 17, fontWeight: '800', color: '#fff' },
  scroll:            { padding: 20, gap: 12 },
  medCard:           { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  medColorBar:       { width: 6 },
  medCardBody:       { flex: 1, padding: 16 },
  medName:           { fontSize: 17, fontWeight: '800', color: Colors.text },
  medSub:            { fontSize: 13, color: Colors.textSecondary, marginTop: 3 },
  medTime:           { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  sectionLabel:      { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8 },
  statusBtn:         { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 16, borderWidth: 1.5 },
  statusBtnTaken:    { backgroundColor: Colors.successBg, borderColor: '#6EE7B7' },
  statusBtnSkipped:  { backgroundColor: Colors.warningBg, borderColor: '#FCD34D' },
  statusBtnMissed:   { backgroundColor: Colors.dangerBg,  borderColor: '#FCA5A5' },
  statusBtnSelected: { borderWidth: 2.5 },
  statusBtnIcon:     { fontSize: 22, width: 28, textAlign: 'center' },
  statusBtnText:     { fontSize: 16, fontWeight: '800' },
  statusBtnSub:      { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  checkmark:         { fontSize: 16, color: Colors.success },
  pillCountInfo:     { backgroundColor: Colors.primaryBg, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#93C5FD' },
  pillCountLabel:    { fontSize: 13, color: Colors.primary },
  pillCountValue:    { fontSize: 20, fontWeight: '800', color: Colors.primary },
  notesInput:        { backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, padding: 14, fontSize: 15, color: Colors.text, minHeight: 80, textAlignVertical: 'top' },
  timeHint:          { fontSize: 12, color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
  confirmBtn:        { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  confirmBtnDisabled:{ opacity: 0.5 },
  confirmBtnText:    { color: '#fff', fontSize: 17, fontWeight: '800' },
})
