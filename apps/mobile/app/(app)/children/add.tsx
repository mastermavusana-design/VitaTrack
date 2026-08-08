import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useChildrenStore } from '@/hooks/useChildren'
import { validateDependant } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'

const SEX_OPTIONS: { value: '' | 'female' | 'male'; label: string }[] = [
  { value: '', label: 'Prefer not to say' },
  { value: 'female', label: 'Girl' },
  { value: 'male', label: 'Boy' },
]

/** Optional non-negative integer from a form string, or 'bad'. */
function optInt(v: string): number | null | 'bad' {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 'bad'
}

export default function AddChildScreen() {
  const { addDependant } = useChildrenStore()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [sex, setSex] = useState<'' | 'female' | 'male'>('')
  const [birthWeight, setBirthWeight] = useState('')
  const [gestAge, setGestAge] = useState('')
  const [relationship, setRelationship] = useState('')
  const [rthbNumber, setRthbNumber] = useState('')
  const [consent, setConsent] = useState(false)

  async function onSubmit() {
    setError(null)
    const bw = optInt(birthWeight)
    const ga = gestAge.trim() === '' ? null : Number(gestAge)
    if (bw === 'bad') { setError('Birth weight must be a non-negative number (grams)'); return }
    if (ga !== null && !Number.isFinite(ga)) { setError('Gestational age must be a number (weeks)'); return }

    const input = {
      full_name: fullName,
      date_of_birth: dob,
      sex: sex || null,
      birth_weight_g: bw,
      gestational_age_wk: ga,
      popia_consent: consent,
    }
    const v = validateDependant(input)
    if (!v.ok) { setError(v.error); return }

    setSubmitting(true)
    const err = await addDependant({
      full_name: fullName,
      date_of_birth: dob,
      sex: sex || null,
      birth_weight_g: bw,
      gestational_age_wk: ga,
      relationship: relationship.trim() || null,
      rthb_number: rthbNumber.trim() || null,
    })
    setSubmitting(false)
    if (err) { setError(err); return }
    router.back()
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹ Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Add Child</Text>
        <TouchableOpacity onPress={onSubmit} disabled={submitting} style={s.saveBtn}>
          {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <SectionHeader title="Child Details" />
          <View style={s.card}>
            <Field label="Full name *">
              <TextInput style={s.input} placeholder="e.g. Thandi Mavusana" placeholderTextColor="#aaa"
                value={fullName} onChangeText={setFullName} accessibilityLabel="Full name" />
            </Field>

            <Field label="Date of birth * (YYYY-MM-DD)">
              <TextInput style={s.input} placeholder="2024-01-31" placeholderTextColor="#aaa"
                autoCapitalize="none" keyboardType="numbers-and-punctuation"
                value={dob} onChangeText={setDob} accessibilityLabel="Date of birth" />
            </Field>

            <Field label="Sex">
              <View style={s.chipWrap}>
                {SEX_OPTIONS.map(o => {
                  const active = sex === o.value
                  return (
                    <TouchableOpacity key={o.label} style={[s.chip, active && s.chipActive]} onPress={() => setSex(o.value)}>
                      <Text style={[s.chipText, active && s.chipTextActive]}>{o.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </Field>

            <View style={s.row}>
              <Field label="Birth weight (g)" style={{ flex: 1 }}>
                <TextInput style={s.input} placeholder="e.g. 3200" placeholderTextColor="#aaa"
                  keyboardType="number-pad" value={birthWeight} onChangeText={setBirthWeight} />
              </Field>
              <Field label="Gestational age (wk)" style={{ flex: 1 }}>
                <TextInput style={s.input} placeholder="e.g. 39" placeholderTextColor="#aaa"
                  keyboardType="decimal-pad" value={gestAge} onChangeText={setGestAge} />
              </Field>
            </View>

            <View style={s.row}>
              <Field label="Relationship" style={{ flex: 1 }}>
                <TextInput style={s.input} placeholder="e.g. child" placeholderTextColor="#aaa"
                  value={relationship} onChangeText={setRelationship} />
              </Field>
              <Field label="RtHB / clinic no." style={{ flex: 1 }}>
                <TextInput style={s.input} placeholder="Optional" placeholderTextColor="#aaa"
                  value={rthbNumber} onChangeText={setRthbNumber} />
              </Field>
            </View>
          </View>

          <SectionHeader title="Consent" />
          <View style={s.card}>
            <View style={s.consentRow}>
              <Switch value={consent} onValueChange={setConsent}
                trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor="#fff" />
              <Text style={s.consentText}>
                I am this child&apos;s parent or legal guardian and I consent to VitaTrack storing
                their health information (POPIA). Required to add a child.
              </Text>
            </View>
          </View>

          {error && (
            <View style={s.serverError}><Text style={s.serverErrorText}>{error}</Text></View>
          )}

          <TouchableOpacity style={s.submitBtn} onPress={onSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Save Child</Text>}
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title}</Text>
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
  scroll:          { padding: 16, gap: 6 },
  sectionHeader:   { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.textMuted, marginTop: 12, marginBottom: 6 },
  card:            { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  fieldLabel:      { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  input:           { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  row:             { flexDirection: 'row', gap: 10 },
  chipWrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  chipActive:      { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:        { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive:  { color: '#fff' },
  consentRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  consentText:     { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  serverError:     { backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 14, marginTop: 8 },
  serverErrorText: { color: Colors.danger, fontSize: 13 },
  submitBtn:       { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  submitBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
})
