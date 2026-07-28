// ── Scan a reading ───────────────────────────────────────────────────
// Camera → extract → review → save. One screen serves Vitals, Records and
// Meds via the `artifact` route param. QR codes are auto-detected and
// imported instantly; otherwise the user taps the shutter.
//
// Clinical-safety rule (product decision): ALWAYS review before save.
// Fields are confidence-coded (green/amber/red) so review takes ~2s, but
// nothing is written until the user taps Save.

import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { router, useLocalSearchParams } from 'expo-router'
import { useVitalsStore } from '@/hooks/useVitals'
import { Colors } from '@/constants/Colors'
import { extractFromPhoto, handleScannedQr, type CaptureOutcome } from '@/hooks/useCapture'
import type { CaptureArtifact, ExtractionResult, FieldConfidence, VitalType } from '@vitatrack/shared'

const ARTIFACT_LABEL: Record<CaptureArtifact, string> = {
  device_screen: 'Device screen',
  lab_report: 'Lab report',
  prescription: 'Prescription',
  document: 'Document',
  qr: 'QR code',
}

const CONF_COLOR: Record<FieldConfidence, { border: string; bg: string; label: string }> = {
  high:   { border: Colors.success, bg: Colors.successBg, label: 'Read clearly' },
  medium: { border: Colors.warning, bg: Colors.warningBg, label: 'Please check' },
  low:    { border: Colors.danger,  bg: Colors.dangerBg,  label: 'Verify / re-scan' },
}

type Stage = 'camera' | 'working' | 'review'

export default function ScanScreen() {
  const { artifact: artifactParam, vitalType: vitalTypeParam } =
    useLocalSearchParams<{ artifact?: string; vitalType?: string }>()
  const artifact = (artifactParam as CaptureArtifact) ?? 'device_screen'
  const vitalHint = vitalTypeParam as VitalType | undefined

  const [permission, requestPermission] = useCameraPermissions()
  const [stage, setStage] = useState<Stage>('camera')
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [unverified, setUnverified] = useState(false)
  const cameraRef = useRef<CameraView>(null)
  const scannedOnce = useRef(false)

  const applyOutcome = useCallback((outcome: CaptureOutcome, unverifiedQr = false) => {
    if (outcome.kind === 'error') {
      Alert.alert('Could not read that', outcome.message)
      setStage('camera')
      return
    }
    setResult(outcome.result)
    setUnverified(unverifiedQr || !!outcome.unverifiedQr)
    setStage('review')
  }, [])

  // QR fast-path: fires automatically when a barcode enters the frame.
  const onBarcode = useCallback(async (scan: BarcodeScanningResult) => {
    if (scannedOnce.current || stage !== 'camera') return
    const outcome = await handleScannedQr(scan.data)
    if (!outcome) return // not a VitaTrack QR — ignore, keep scanning
    scannedOnce.current = true
    setStage('working')
    applyOutcome(outcome, outcome.kind === 'ok' && !!outcome.unverifiedQr)
  }, [stage, applyOutcome])

  const onShutter = useCallback(async () => {
    if (!cameraRef.current) return
    setStage('working')
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 })
    const outcome = await extractFromPhoto(artifact, {
      uri: photo?.uri ?? '', base64: photo?.base64, mimeType: 'image/jpeg', vitalType: vitalHint,
    })
    applyOutcome(outcome)
  }, [artifact, applyOutcome, vitalHint])

  if (!permission) return <View style={s.root} />
  if (!permission.granted) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}>
          <Text style={s.permTitle}>Camera access needed</Text>
          <Text style={s.permBody}>VitaTrack reads your device screen or report so you don't have to type it.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={requestPermission}>
            <Text style={s.primaryBtnText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}><Text style={s.link}>Cancel</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (stage === 'review' && result) {
    return <ReviewPane artifact={artifact} result={result} unverified={unverified}
      onRescan={() => { scannedOnce.current = false; setStage('camera') }} />
  }

  return (
    <View style={s.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onBarcode}
      />
      <SafeAreaView style={s.overlay} edges={['top', 'bottom']}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Text style={s.overlayText}>‹ Cancel</Text></TouchableOpacity>
          <Text style={s.overlayText}>{ARTIFACT_LABEL[artifact]}</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={s.reticle} />
        <Text style={s.hint}>
          {artifact === 'device_screen'
            ? 'Aim at the reading. Hold steady for a moment.'
            : 'Fit the whole page in frame. A VitaTrack QR imports instantly.'}
        </Text>

        <View style={s.bottomBar}>
          {stage === 'working'
            ? <ActivityIndicator color="#fff" size="large" />
            : <TouchableOpacity style={s.shutter} onPress={onShutter} accessibilityLabel="Capture" />}
        </View>
      </SafeAreaView>
    </View>
  )
}

// ── Review pane ──────────────────────────────────────────────
function ReviewPane({
  artifact, result, unverified, onRescan,
}: { artifact: CaptureArtifact; result: ExtractionResult; unverified: boolean; onRescan: () => void }) {
  const { addVital } = useVitalsStore()
  const [saving, setSaving] = useState(false)

  // Editable copies of the vitals fields (review-before-save).
  const v = result.vitals
  const [systolic, setSystolic] = useState(numStr(v?.systolic?.value))
  const [diastolic, setDiastolic] = useState(numStr(v?.diastolic?.value))
  const [pulse, setPulse] = useState(numStr(v?.pulse?.value))
  const [glucose, setGlucose] = useState(numStr(v?.glucose?.value))
  const [weight, setWeight] = useState(numStr(v?.weight?.value))
  const [temp, setTemp] = useState(numStr(v?.temp?.value))
  const [spo2, setSpo2] = useState(numStr(v?.spo2?.value))
  const [heartRate, setHeartRate] = useState(numStr(v?.heartRate?.value))

  const vitalType: VitalType = v?.type ?? 'glucose'

  const save = async () => {
    setSaving(true)
    const base = {
      type: vitalType,
      recorded_at: result.recordedAt?.value ?? new Date().toISOString(),
      notes: null,
      systolic: null, diastolic: null, pulse: null, arm: null, bp_position: null,
      glucose_value: null, glucose_unit: null, meal_context: null,
      weight_value: null, weight_unit: null, temp_value: null, temp_unit: null, temp_site: null,
      spo2_value: null, heart_rate: null, device: 'scan',
    } as Parameters<typeof addVital>[0]

    let payload = base
    if (vitalType === 'blood_pressure') {
      payload = { ...base, systolic: toNum(systolic), diastolic: toNum(diastolic), pulse: toNum(pulse) }
    } else if (vitalType === 'glucose') {
      payload = { ...base, glucose_value: toNum(glucose), glucose_unit: v?.glucoseUnit?.value ?? 'mmol/L' }
    } else if (vitalType === 'weight') {
      payload = { ...base, weight_value: toNum(weight), weight_unit: v?.weightUnit?.value ?? 'kg' }
    } else if (vitalType === 'temperature') {
      payload = { ...base, temp_value: toNum(temp), temp_unit: v?.tempUnit?.value ?? '°C' }
    } else if (vitalType === 'spo2') {
      payload = { ...base, spo2_value: toNum(spo2), heart_rate: toNum(heartRate) }
    } else if (vitalType === 'heart_rate') {
      payload = { ...base, heart_rate: toNum(heartRate) }
    }
    const err = await addVital(payload)
    setSaving(false)
    if (err) { Alert.alert('Could not save', err); return }
    router.back()
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={onRescan}><Text style={s.backText}>‹ Re-scan</Text></TouchableOpacity>
        <Text style={s.headerTitle}>Review reading</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.reviewLead}>
          Read from {ARTIFACT_LABEL[artifact].toLowerCase()}. Check the values, then Save.
        </Text>
        {unverified && (
          <View style={[s.banner, { backgroundColor: Colors.warningBg }]}>
            <Text style={{ color: Colors.warning }}>
              This QR isn't cryptographically verified yet — please confirm each value.
            </Text>
          </View>
        )}
        {result.warnings.includes('glare_detected') && (
          <View style={[s.banner, { backgroundColor: Colors.warningBg }]}>
            <Text style={{ color: Colors.warning }}>Glare detected — double-check the numbers.</Text>
          </View>
        )}

        {vitalType === 'blood_pressure' && (
          <>
            <ConfField label="Systolic (mmHg)" conf={v?.systolic?.confidence} value={systolic} onChange={setSystolic} />
            <ConfField label="Diastolic (mmHg)" conf={v?.diastolic?.confidence} value={diastolic} onChange={setDiastolic} />
            <ConfField label="Pulse (bpm)" conf={v?.pulse?.confidence} value={pulse} onChange={setPulse} />
          </>
        )}
        {vitalType === 'glucose' && (
          <ConfField label={`Glucose (${v?.glucoseUnit?.value ?? 'mmol/L'})`}
            conf={v?.glucose?.confidence} value={glucose} onChange={setGlucose} />
        )}
        {vitalType === 'weight' && (
          <ConfField label={`Weight (${v?.weightUnit?.value ?? 'kg'})`}
            conf={v?.weight?.confidence} value={weight} onChange={setWeight} />
        )}
        {vitalType === 'temperature' && (
          <ConfField label={`Temperature (${v?.tempUnit?.value ?? '°C'})`}
            conf={v?.temp?.confidence} value={temp} onChange={setTemp} />
        )}
        {vitalType === 'spo2' && (
          <>
            <ConfField label="SpO₂ (%)" conf={v?.spo2?.confidence} value={spo2} onChange={setSpo2} />
            <ConfField label="Pulse (bpm)" conf={v?.heartRate?.confidence} value={heartRate} onChange={setHeartRate} />
          </>
        )}
        {vitalType === 'heart_rate' && (
          <ConfField label="Heart rate (bpm)" conf={v?.heartRate?.confidence} value={heartRate} onChange={setHeartRate} />
        )}

        {result.labs && result.labs.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.sectionTitle}>Lab values</Text>
            {result.labs.map((lab, i) => (
              <View key={i} style={[s.card, confBorder(lab.value.confidence)]}>
                <Text style={s.labAnalyte}>{lab.analyte.value ?? 'Unknown analyte'}</Text>
                <Text style={s.labValue}>{String(lab.value.value ?? '—')} {lab.unit?.value ?? ''}</Text>
                <Text style={s.confTag}>{CONF_COLOR[lab.value.confidence].label}</Text>
              </View>
            ))}
            <Text style={s.note}>Lab values save to your Records. (Wire-up: lab_results table.)</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function ConfField({
  label, conf = 'low', value, onChange,
}: { label: string; conf?: FieldConfidence; value: string; onChange: (t: string) => void }) {
  const c = CONF_COLOR[conf]
  return (
    <View style={[s.card, { borderColor: c.border, borderLeftWidth: 4 }]}>
      <View style={s.fieldHead}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={[s.confPill, { backgroundColor: c.bg }]}>
          <Text style={[s.confPillText, { color: c.border }]}>{c.label}</Text>
        </View>
      </View>
      <TextInput style={s.input} value={value} onChangeText={onChange}
        keyboardType="decimal-pad" placeholder="—" placeholderTextColor="#aaa" />
    </View>
  )
}

const numStr = (n: number | null | undefined) => (n == null ? '' : String(n))
const toNum = (s: string): number | null => (s.trim() === '' ? null : Number(s))
const confBorder = (conf: FieldConfidence) => ({ borderColor: CONF_COLOR[conf].border, borderLeftWidth: 4 })

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  overlayText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  reticle: { alignSelf: 'center', width: 260, height: 160, borderWidth: 2, borderColor: '#fff', borderRadius: 16, opacity: 0.9 },
  hint: { color: '#fff', textAlign: 'center', paddingHorizontal: 32, fontSize: 15 },
  bottomBar: { alignItems: 'center', paddingVertical: 28, minHeight: 96, justifyContent: 'center' },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)' },
  permTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  permBody: { textAlign: 'center', color: Colors.textSecondary },
  primaryBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  link: { color: Colors.primary, marginTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  backText: { color: Colors.primary, fontSize: 16 },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, minWidth: 64, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
  scroll: { padding: 16, gap: 12 },
  reviewLead: { color: Colors.textSecondary },
  banner: { padding: 12, borderRadius: 8 },
  card: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  confPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  confPillText: { fontSize: 11, fontWeight: '700' },
  input: { backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, color: Colors.text },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  labAnalyte: { fontSize: 14, fontWeight: '600', color: Colors.text },
  labValue: { fontSize: 18, color: Colors.text, marginTop: 2 },
  confTag: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  note: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
})
