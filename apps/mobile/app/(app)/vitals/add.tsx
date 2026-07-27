import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useVitalsStore } from '@/hooks/useVitals'
import { Colors } from '@/constants/Colors'
import { MEAL_CONTEXTS, BP_POSITIONS } from '@vitatrack/shared'
import type { VitalType, MealContext, BPPosition, BPArm } from '@vitatrack/shared'

export default function AddVitalScreen() {
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>()
  const [activeType, setActiveType] = useState<VitalType>((typeParam as VitalType) ?? 'blood_pressure')
  const [isLogging, setIsLogging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { addVital } = useVitalsStore()

  // BP fields
  const [systolic, setSystolic]   = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse]         = useState('')
  const [arm, setArm]             = useState<BPArm>('left')
  const [bpPos, setBpPos]         = useState<BPPosition>('sitting')

  // Glucose fields
  const [glucose, setGlucose]         = useState('')
  const [glucoseUnit, setGlucoseUnit] = useState<'mmol/L' | 'mg/dL'>('mmol/L')
  const [mealCtx, setMealCtx]         = useState<MealContext>('fasting')

  // Weight
  const [weight, setWeight]           = useState('')
  const [weightUnit, setWeightUnit]   = useState<'kg' | 'lbs'>('kg')

  // Common
  const [notes, setNotes]             = useState('')

  const handleSave = async () => {
    setError(null)
    setIsLogging(true)

    let payload: Parameters<typeof addVital>[0] = {
      type: activeType,
      recorded_at: new Date().toISOString(),
      notes: notes.trim() || null,
      systolic: null, diastolic: null, pulse: null, arm: null, bp_position: null,
      glucose_value: null, glucose_unit: null, meal_context: null,
      weight_value: null, weight_unit: null,
      temp_value: null, temp_unit: null, temp_site: null,
      spo2_value: null, heart_rate: null, device: null,
    }

    if (activeType === 'blood_pressure') {
      if (!systolic || !diastolic) { setError('Systolic and diastolic are required'); setIsLogging(false); return }
      payload = { ...payload, systolic: +systolic, diastolic: +diastolic, pulse: pulse ? +pulse : null, arm, bp_position: bpPos }
    } else if (activeType === 'glucose') {
      if (!glucose) { setError('Glucose value is required'); setIsLogging(false); return }
      payload = { ...payload, glucose_value: +glucose, glucose_unit: glucoseUnit, meal_context: mealCtx }
    } else if (activeType === 'weight') {
      if (!weight) { setError('Weight is required'); setIsLogging(false); return }
      payload = { ...payload, weight_value: +weight, weight_unit: weightUnit }
    }

    const err = await addVital(payload)
    setIsLogging(false)
    if (err) { setError(err); return }
    router.back()
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.backText}>‹ Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Log Vital</Text>
        <TouchableOpacity onPress={handleSave} disabled={isLogging} style={s.saveBtn}>
          {isLogging ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Type selector */}
          <View style={s.typeRow}>
            {([['blood_pressure','❤️ BP'],['glucose','🩸 Glucose'],['weight','⚖️ Weight']] as [VitalType, string][]).map(([t, label]) => (
              <TouchableOpacity key={t} style={[s.typeBtn, activeType === t && s.typeBtnActive]} onPress={() => setActiveType(t)}>
                <Text style={[s.typeBtnText, activeType === t && s.typeBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Blood Pressure */}
          {activeType === 'blood_pressure' && (
            <View style={s.card}>
              <View style={s.bpRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Systolic (mmHg) *</Text>
                  <TextInput style={s.input} placeholder="120" placeholderTextColor="#aaa"
                    keyboardType="number-pad" value={systolic} onChangeText={setSystolic} accessibilityLabel="Systolic" />
                </View>
                <Text style={s.bpSlash}>/</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Diastolic *</Text>
                  <TextInput style={s.input} placeholder="80" placeholderTextColor="#aaa"
                    keyboardType="number-pad" value={diastolic} onChangeText={setDiastolic} accessibilityLabel="Diastolic" />
                </View>
              </View>
              <Text style={s.fieldLabel}>Pulse (bpm)</Text>
              <TextInput style={s.input} placeholder="72" placeholderTextColor="#aaa"
                keyboardType="number-pad" value={pulse} onChangeText={setPulse} accessibilityLabel="Pulse" />
              <Text style={[s.fieldLabel, { marginTop: 10 }]}>Arm</Text>
              <View style={s.chipRow}>
                {(['left','right'] as BPArm[]).map(a => (
                  <TouchableOpacity key={a} style={[s.chip, arm === a && s.chipActive]} onPress={() => setArm(a)}>
                    <Text style={[s.chipText, arm === a && s.chipTextActive]}>{a.charAt(0).toUpperCase() + a.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.fieldLabel, { marginTop: 10 }]}>Position</Text>
              <View style={s.chipRow}>
                {BP_POSITIONS.map(p => (
                  <TouchableOpacity key={p.value} style={[s.chip, bpPos === p.value && s.chipActive]} onPress={() => setBpPos(p.value as BPPosition)}>
                    <Text style={[s.chipText, bpPos === p.value && s.chipTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Glucose */}
          {activeType === 'glucose' && (
            <View style={s.card}>
              <View style={s.bpRow}>
                <View style={{ flex: 2 }}>
                  <Text style={s.fieldLabel}>Glucose value *</Text>
                  <TextInput style={s.input} placeholder="5.5" placeholderTextColor="#aaa"
                    keyboardType="decimal-pad" value={glucose} onChangeText={setGlucose} accessibilityLabel="Glucose value" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Unit</Text>
                  <View style={s.chipRow}>
                    {(['mmol/L','mg/dL'] as const).map(u => (
                      <TouchableOpacity key={u} style={[s.chip, glucoseUnit === u && s.chipActive]} onPress={() => setGlucoseUnit(u)}>
                        <Text style={[s.chipText, glucoseUnit === u && s.chipTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
              <Text style={[s.fieldLabel, { marginTop: 10 }]}>Context</Text>
              <View style={s.chipRow}>
                {MEAL_CONTEXTS.map(c => (
                  <TouchableOpacity key={c.value} style={[s.chip, mealCtx === c.value && s.chipActive]} onPress={() => setMealCtx(c.value as MealContext)}>
                    <Text style={[s.chipText, mealCtx === c.value && s.chipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Weight */}
          {activeType === 'weight' && (
            <View style={s.card}>
              <View style={s.bpRow}>
                <View style={{ flex: 2 }}>
                  <Text style={s.fieldLabel}>Weight *</Text>
                  <TextInput style={s.input} placeholder="72.5" placeholderTextColor="#aaa"
                    keyboardType="decimal-pad" value={weight} onChangeText={setWeight} accessibilityLabel="Weight" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Unit</Text>
                  <View style={s.chipRow}>
                    {(['kg','lbs'] as const).map(u => (
                      <TouchableOpacity key={u} style={[s.chip, weightUnit === u && s.chipActive]} onPress={() => setWeightUnit(u)}>
                        <Text style={[s.chipText, weightUnit === u && s.chipTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Notes */}
          <View style={s.card}>
            <Text style={s.fieldLabel}>Note (optional)</Text>
            <TextInput style={[s.input, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Device used, how you felt..." placeholderTextColor="#aaa"
              multiline value={notes} onChangeText={setNotes} />
          </View>

          {error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}

          <TouchableOpacity style={[s.saveFullBtn, isLogging && { opacity: 0.6 }]} onPress={handleSave} disabled={isLogging}>
            {isLogging ? <ActivityIndicator color="#fff" /> : <Text style={s.saveFullBtnText}>Save Reading</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:               { flex: 1, backgroundColor: Colors.background },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14 },
  backText:           { color: '#fff', fontSize: 16 },
  headerTitle:        { fontSize: 17, fontWeight: '800', color: '#fff' },
  saveBtn:            { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  saveText:           { color: '#fff', fontSize: 15, fontWeight: '700' },
  scroll:             { padding: 16, gap: 12 },
  typeRow:            { flexDirection: 'row', gap: 8 },
  typeBtn:            { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  typeBtnActive:      { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeBtnText:        { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  typeBtnTextActive:  { color: '#fff' },
  card:               { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  fieldLabel:         { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  input:              { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  bpRow:              { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  bpSlash:            { fontSize: 24, color: Colors.textMuted, paddingBottom: 10 },
  chipRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:               { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  chipActive:         { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:           { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive:     { color: '#fff' },
  errorBox:           { backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 12 },
  errorText:          { color: Colors.danger, fontSize: 13 },
  saveFullBtn:        { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  saveFullBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
})
