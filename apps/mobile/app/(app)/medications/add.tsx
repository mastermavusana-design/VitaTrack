import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMedicationsStore } from '@/hooks/useMedications'
import { Colors } from '@/constants/Colors'
import {
  MEDICATION_FORMS, FREQUENCY_OPTIONS, DEFAULT_TIMES,
} from '@vitatrack/shared'
import type { MedicationForm, ScheduleFrequency } from '@vitatrack/shared'

const schema = z.object({
  name:             z.string().min(1, 'Medication name is required'),
  generic_name:     z.string().optional(),
  form:             z.enum(['tablet','capsule','liquid','injection','patch','inhaler','drops','other']).optional(),
  strength:         z.string().optional(),
  strength_unit:    z.string().optional(),
  instructions:     z.string().optional(),
  prescriber:       z.string().optional(),
  pill_count:       z.coerce.number().int().min(0).optional(),
  refill_threshold: z.coerce.number().int().min(0).optional(),
  // Schedule
  frequency:        z.string().default('daily'),
  reminder_enabled: z.boolean().default(true),
})
type FormData = z.infer<typeof schema>

const MED_COLORS = ['#1A569B','#059669','#D97706','#DC2626','#7C3AED','#0891B2','#BE185D']

export default function AddMedicationScreen() {
  const [times, setTimes] = useState<string[]>(['08:00'])
  const [selectedColor, setSelectedColor] = useState(MED_COLORS[0])
  const [serverError, setServerError] = useState<string | null>(null)
  const { addMedication } = useMedicationsStore()

  const { control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { frequency: 'daily', reminder_enabled: true },
  })

  const frequency = watch('frequency') as ScheduleFrequency

  const onFrequencyChange = (freq: string) => {
    setValue('frequency', freq)
    setTimes(DEFAULT_TIMES[freq] ?? ['08:00'])
  }

  const addTime = () => setTimes(t => [...t, '08:00'])
  const removeTime = (i: number) => setTimes(t => t.filter((_, idx) => idx !== i))
  const updateTime = (i: number, val: string) => setTimes(t => t.map((tt, idx) => idx === i ? val : tt))

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    const err = await addMedication(
      {
        name: data.name,
        generic_name: data.generic_name ?? null,
        form: (data.form as MedicationForm) ?? null,
        strength: data.strength ? (Number.parseFloat(data.strength) || null) : null,
        strength_unit: data.strength_unit ?? null,
        instructions: data.instructions ?? null,
        prescriber: data.prescriber ?? null,
        start_date: null,
        end_date: null,
        is_active: true,
        pill_count: data.pill_count ?? null,
        refill_threshold: data.refill_threshold ?? null,
        color: selectedColor,
        reminder_enabled: data.reminder_enabled,
        notes: null,
        archived_at: null,
        profile_id: '', // filled by store
      },
      frequency === 'as_needed' ? [] : [{
        frequency: frequency as ScheduleFrequency,
        times,
        days_of_week: null,
        cron_expression: null,
        dose_amount: null,
        dose_unit: null,
        reminder_enabled: data.reminder_enabled,
        reminder_minutes_before: 0,
        is_active: true,
      }]
    )
    if (err) { setServerError(err); return }
    router.back()
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹ Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Add Medication</Text>
        <TouchableOpacity
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          style={s.saveBtn}
        >
          {isSubmitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Medication details */}
          <SectionHeader title="Medication Details" />
          <View style={s.card}>
            <Field label="Medication Name *">
              <Controller control={control} name="name" render={({ field }) => (
                <TextInput style={[s.input, errors.name && s.inputError]}
                  placeholder="e.g. Metformin" placeholderTextColor="#aaa"
                  value={field.value} onChangeText={field.onChange}
                  accessibilityLabel="Medication name" />
              )} />
              {errors.name && <Text style={s.errorText}>{errors.name.message}</Text>}
            </Field>

            <Field label="Generic Name (optional)">
              <Controller control={control} name="generic_name" render={({ field }) => (
                <TextInput style={s.input} placeholder="e.g. Metformin hydrochloride"
                  placeholderTextColor="#aaa" value={field.value} onChangeText={field.onChange} />
              )} />
            </Field>

            <Field label="Strength & Unit">
              <View style={s.row}>
                <Controller control={control} name="strength" render={({ field }) => (
                  <TextInput style={[s.input, { flex: 2 }]} placeholder="500" placeholderTextColor="#aaa"
                    keyboardType="decimal-pad" value={field.value} onChangeText={field.onChange} />
                )} />
                <Controller control={control} name="strength_unit" render={({ field }) => (
                  <View style={[s.input, { flex: 1, justifyContent: 'center' }]}>
                    {/* In production use a Picker or BottomSheet */}
                    <Text style={{ color: field.value ? Colors.text : '#aaa' }}>{field.value ?? 'mg ▾'}</Text>
                  </View>
                )} />
              </View>
            </Field>

            <Field label="Form">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                {MEDICATION_FORMS.map(f => {
                  const isSelected = watch('form') === f.value
                  return (
                    <TouchableOpacity key={f.value} style={[s.formChip, isSelected && s.formChipActive]}
                      onPress={() => setValue('form', f.value as MedicationForm)}>
                      <Text style={[s.formChipText, isSelected && s.formChipTextActive]}>{f.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </Field>

            <Field label="Prescriber (optional)">
              <Controller control={control} name="prescriber" render={({ field }) => (
                <TextInput style={s.input} placeholder="Dr Surname" placeholderTextColor="#aaa"
                  value={field.value} onChangeText={field.onChange} />
              )} />
            </Field>

            <Field label="Instructions (optional)">
              <Controller control={control} name="instructions" render={({ field }) => (
                <TextInput style={[s.input, { height: 72, textAlignVertical: 'top' }]}
                  placeholder="e.g. Take with food, avoid sunlight" placeholderTextColor="#aaa"
                  multiline value={field.value} onChangeText={field.onChange} />
              )} />
            </Field>

            {/* Colour picker */}
            <Field label="Colour (for visual identification)">
              <View style={s.colorRow}>
                {MED_COLORS.map(c => (
                  <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, selectedColor === c && s.colorDotSelected]}
                    onPress={() => setSelectedColor(c)} accessibilityLabel={`Color ${c}`} />
                ))}
              </View>
            </Field>
          </View>

          {/* Schedule */}
          <SectionHeader title="Schedule" />
          <View style={s.card}>
            <Field label="Frequency">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                {FREQUENCY_OPTIONS.map(f => {
                  const isSelected = watch('frequency') === f.value
                  return (
                    <TouchableOpacity key={f.value} style={[s.formChip, isSelected && s.formChipActive]}
                      onPress={() => onFrequencyChange(f.value)}>
                      <Text style={[s.formChipText, isSelected && s.formChipTextActive]}>{f.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </Field>

            {frequency !== 'as_needed' && (
              <Field label="Times">
                {times.map((t, i) => (
                  <View key={i} style={[s.row, { marginBottom: 8 }]}>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={t}
                      onChangeText={v => updateTime(i, v)}
                      placeholder="HH:MM"
                      placeholderTextColor="#aaa"
                      accessibilityLabel={`Time ${i + 1}`}
                    />
                    {times.length > 1 && (
                      <TouchableOpacity onPress={() => removeTime(i)} style={s.removeTimeBtn}>
                        <Text style={s.removeTimeBtnText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity style={s.addTimeBtn} onPress={addTime}>
                  <Text style={s.addTimeBtnText}>＋ Add time</Text>
                </TouchableOpacity>
              </Field>
            )}

            <Field label="Reminders">
              <Controller control={control} name="reminder_enabled" render={({ field }) => (
                <View style={s.toggleRow}>
                  <Switch value={field.value} onValueChange={field.onChange}
                    trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor="#fff" />
                  <Text style={s.toggleLabel}>Send dose reminders</Text>
                </View>
              )} />
            </Field>
          </View>

          {/* Refill tracking */}
          <SectionHeader title="Refill Tracking" />
          <View style={s.card}>
            <View style={s.row}>
              <Field label="Current count" style={{ flex: 1 }}>
                <Controller control={control} name="pill_count" render={({ field }) => (
                  <TextInput style={s.input} placeholder="e.g. 30" placeholderTextColor="#aaa"
                    keyboardType="number-pad" value={field.value?.toString()}
                    onChangeText={field.onChange} accessibilityLabel="Current pill count" />
                )} />
              </Field>
              <Field label="Alert when ≤" style={{ flex: 1 }}>
                <Controller control={control} name="refill_threshold" render={({ field }) => (
                  <TextInput style={s.input} placeholder="e.g. 7" placeholderTextColor="#aaa"
                    keyboardType="number-pad" value={field.value?.toString()}
                    onChangeText={field.onChange} accessibilityLabel="Refill alert threshold" />
                )} />
              </Field>
            </View>
          </View>

          {serverError && (
            <View style={s.serverError}>
              <Text style={s.serverErrorText}>{serverError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={s.submitBtn}
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>Save Medication</Text>
            }
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
  root:               { flex: 1, backgroundColor: Colors.background },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14 },
  backBtn:            {},
  backText:           { color: '#fff', fontSize: 16 },
  headerTitle:        { fontSize: 17, fontWeight: '800', color: '#fff' },
  saveBtn:            { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  saveText:           { color: '#fff', fontSize: 15, fontWeight: '700' },
  scroll:             { padding: 16, gap: 6 },
  sectionHeader:      { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.textMuted, marginTop: 12, marginBottom: 6 },
  card:               { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  fieldLabel:         { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  input:              { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  inputError:         { borderColor: Colors.danger },
  errorText:          { fontSize: 12, color: Colors.danger, marginTop: 4 },
  row:                { flexDirection: 'row', gap: 10 },
  chipRow:            { marginBottom: 4 },
  formChip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, marginRight: 8 },
  formChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  formChipText:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  formChipTextActive: { color: '#fff' },
  colorRow:           { flexDirection: 'row', gap: 12 },
  colorDot:           { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected:   { borderWidth: 3, borderColor: Colors.text },
  toggleRow:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel:        { fontSize: 14, color: Colors.text },
  removeTimeBtn:      { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeTimeBtnText:  { fontSize: 16, color: Colors.danger },
  addTimeBtn:         { paddingVertical: 10, alignItems: 'center' },
  addTimeBtnText:     { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  serverError:        { backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 14, marginTop: 8 },
  serverErrorText:    { color: Colors.danger, fontSize: 13 },
  submitBtn:          { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  submitBtnText:      { color: '#fff', fontSize: 16, fontWeight: '700' },
})
