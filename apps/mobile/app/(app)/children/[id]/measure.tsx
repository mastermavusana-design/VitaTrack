import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { validateGrowthMeasurement } from '@vitatrack/shared'
import { useChildrenStore } from '@/hooks/useChildren'
import { Colors } from '@/constants/Colors'

function optNum(v: string): number | null | 'bad' {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 'bad'
}

export default function AddMeasurementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { addGrowthMeasurement } = useChildrenStore()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [measuredAt, setMeasuredAt] = useState(today)
  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [headCirc, setHeadCirc] = useState('')
  const [muac, setMuac] = useState('')

  async function onSubmit() {
    setError(null)
    const w = optNum(weight), l = optNum(length), h = optNum(headCirc), m = optNum(muac)
    if ([w, l, h, m].includes('bad')) { setError('Measurements must be non-negative numbers'); return }

    const input = {
      measured_at: measuredAt,
      weight_kg: w as number | null,
      length_cm: l as number | null,
      head_circ_cm: h as number | null,
      muac_cm: m as number | null,
    }
    const v = validateGrowthMeasurement(input)
    if (!v.ok) { setError(v.error); return }

    setSubmitting(true)
    const err = await addGrowthMeasurement(id, input)
    setSubmitting(false)
    if (err) { setError(err); return }
    router.back()
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Text style={s.backText}>‹ Cancel</Text></TouchableOpacity>
        <Text style={s.headerTitle}>Add Measurement</Text>
        <TouchableOpacity onPress={onSubmit} disabled={submitting} style={s.saveBtn}>
          {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.hint}>Enter at least one measurement.</Text>
          <View style={s.card}>
            <Field label="Date measured (YYYY-MM-DD)">
              <TextInput style={s.input} value={measuredAt} onChangeText={setMeasuredAt}
                autoCapitalize="none" keyboardType="numbers-and-punctuation" placeholder={today} placeholderTextColor="#aaa" />
            </Field>
            <View style={s.row}>
              <Field label="Weight (kg)" style={{ flex: 1 }}>
                <TextInput style={s.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="e.g. 8.4" placeholderTextColor="#aaa" />
              </Field>
              <Field label="Length/height (cm)" style={{ flex: 1 }}>
                <TextInput style={s.input} value={length} onChangeText={setLength} keyboardType="decimal-pad" placeholder="e.g. 70" placeholderTextColor="#aaa" />
              </Field>
            </View>
            <View style={s.row}>
              <Field label="Head circ. (cm)" style={{ flex: 1 }}>
                <TextInput style={s.input} value={headCirc} onChangeText={setHeadCirc} keyboardType="decimal-pad" placeholder="Optional" placeholderTextColor="#aaa" />
              </Field>
              <Field label="MUAC (cm)" style={{ flex: 1 }}>
                <TextInput style={s.input} value={muac} onChangeText={setMuac} keyboardType="decimal-pad" placeholder="Optional" placeholderTextColor="#aaa" />
              </Field>
            </View>
          </View>

          {error && <View style={s.serverError}><Text style={s.serverErrorText}>{error}</Text></View>}

          <TouchableOpacity style={s.submitBtn} onPress={onSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Save Measurement</Text>}
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: Colors.background },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14 },
  backBtn:         {},
  backText:        { color: '#fff', fontSize: 16 },
  headerTitle:     { fontSize: 17, fontWeight: '800', color: '#fff' },
  saveBtn:         { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  saveText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  scroll:          { padding: 16 },
  hint:            { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  card:            { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  fieldLabel:      { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  input:           { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  row:             { flexDirection: 'row', gap: 10 },
  serverError:     { backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 14, marginTop: 8 },
  serverErrorText: { color: Colors.danger, fontSize: 13 },
  submitBtn:       { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  submitBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
})
