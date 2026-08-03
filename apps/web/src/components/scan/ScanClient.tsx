'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  parseDeviceScreenText,
  detectVitalType,
  overallConfidence,
  type VitalsExtraction,
  type VitalType,
  type FieldConfidence,
} from '@vitatrack/shared'
import { ocrImage, type OcrProgress } from '@/lib/ocr'
import { detectBarcode, barcodeDetectionSupported, isProductBarcode } from '@/lib/barcode'
import { verifyScannedQr, refreshTrustedKeys } from '@/lib/qrVerify'

type Artifact = 'device_screen' | 'prescription' | 'document' | 'medication'
type Stage = 'permission' | 'camera' | 'working' | 'review-vitals' | 'review-doc' | 'barcode' | 'saved' | 'error'

const ARTIFACT_LABEL: Record<Artifact, string> = {
  device_screen: 'Scan a vitals device',
  prescription:  'Scan a prescription',
  document:      'Scan a document',
  medication:    'Scan a medication barcode',
}

const DOC_CATEGORIES = [
  { value: 'prescription', label: '💊 Prescription' },
  { value: 'lab_result',   label: '🧪 Lab result' },
  { value: 'imaging',      label: '🩻 Imaging' },
  { value: 'hospital',     label: '🏥 Doctor letter / hospital' },
  { value: 'insurance',    label: '📄 Patient info / insurance' },
  { value: 'other',        label: '📎 Other' },
]

const CONF_STYLE: Record<FieldConfidence, string> = {
  high:   'border-green-300 bg-green-50',
  medium: 'border-amber-300 bg-amber-50',
  low:    'border-red-300 bg-red-50',
}
const CONF_LABEL: Record<FieldConfidence, string> = {
  high: 'Read clearly', medium: 'Please check', low: 'Verify / re-scan',
}

interface Props { artifact: Artifact; vitalHint?: VitalType }

export default function ScanClient({ artifact, vitalHint }: Props) {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanLoop = useRef<number | null>(null)
  const shotRef = useRef<Blob | null>(null)

  const [stage, setStage] = useState<Stage>('permission')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<OcrProgress | null>(null)

  // vitals review state
  const [vitalsType, setVitalsType] = useState<VitalType>(vitalHint ?? 'blood_pressure')
  const [, setVitals] = useState<VitalsExtraction | null>(null)
  const [vitalFields, setVitalFields] = useState<Record<string, string>>({})
  const [conf, setConf] = useState<Record<string, FieldConfidence>>({})
  const [overall, setOverall] = useState<number>(0)
  const [rawExtract, setRawExtract] = useState<unknown>(null)
  // Provenance of the current reading (recorded on the scan_capture row).
  const [capMeta, setCapMeta] = useState<{ artifact: string; method: string; engine: string }>({
    artifact: 'device_screen', method: 'on_device', engine: 'tesseract.js@5',
  })

  // document review state
  const [docCategory, setDocCategory] = useState(artifact === 'prescription' ? 'prescription' : 'hospital')
  const [docTitle, setDocTitle] = useState('')
  const [docNotes, setDocNotes] = useState('')
  const [docPreview, setDocPreview] = useState<string | null>(null)

  // barcode state
  const [barcode, setBarcode] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Camera lifecycle ───────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (scanLoop.current) { cancelAnimationFrame(scanLoop.current); scanLoop.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStage('camera')
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser and try again.'
          : 'Could not open the camera on this device.',
      )
      setStage('error')
    }
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Load the trusted QR issuer keys once so signed reading-QRs can be verified.
  useEffect(() => { void refreshTrustedKeys() }, [])

  // ── Continuous barcode/QR detection while the camera is live ────────
  useEffect(() => {
    if (stage !== 'camera') return
    if (!barcodeDetectionSupported()) return
    let active = true
    const tick = async () => {
      if (!active || !videoRef.current || videoRef.current.readyState < 2) {
        scanLoop.current = requestAnimationFrame(tick); return
      }
      const hit = await detectBarcode(videoRef.current)
      if (hit && active) {
        // A VitaTrack reading QR → verify its Ed25519 signature (parity with mobile).
        // A valid signature loads at high confidence; an unverifiable VitaTrack QR
        // still loads but is flagged for mandatory review; anything else is ignored.
        const outcome = await verifyScannedQr(hit.rawValue)
        if (outcome.kind === 'verified' || outcome.kind === 'unverified') {
          if (outcome.result.vitals) {
            stopCamera()
            loadVitalsExtraction(outcome.result.vitals, outcome.kind === 'unverified', {
              artifact: 'qr', method: 'qr', engine: outcome.result.engine ?? 'qr',
            })
            return
          }
        }
        // Otherwise, in medication mode, treat a product barcode as the item code.
        if (artifact === 'medication' && isProductBarcode(hit.format)) {
          stopCamera()
          setBarcode(hit.rawValue)
          setStage('barcode')
          return
        }
      }
      scanLoop.current = requestAnimationFrame(tick)
    }
    scanLoop.current = requestAnimationFrame(tick)
    return () => { active = false; if (scanLoop.current) cancelAnimationFrame(scanLoop.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, artifact])

  // ── Frame capture ──────────────────────────────────────────────────
  function grabFrame(): { canvas: HTMLCanvasElement; blob: Promise<Blob | null> } {
    const v = videoRef.current!
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth || 1280
    canvas.height = v.videoHeight || 720
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    return { canvas, blob: new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.85)) }
  }

  // ── Vitals: OCR → parse → review ───────────────────────────────────
  function loadVitalsExtraction(
    ext: VitalsExtraction,
    unverified: boolean,
    meta: { artifact: string; method: string; engine: string } = { artifact: 'device_screen', method: 'on_device', engine: 'tesseract.js@5' },
  ) {
    setCapMeta(meta)
    const t = ext.type
    setVitalsType(t)
    const f: Record<string, string> = {}
    const c: Record<string, FieldConfidence> = {}
    const put = (k: string, ef?: { value: unknown; confidence: FieldConfidence }) => {
      if (ef && ef.value != null) { f[k] = String(ef.value); c[k] = unverified ? 'medium' : ef.confidence }
    }
    put('systolic', ext.systolic); put('diastolic', ext.diastolic); put('pulse', ext.pulse)
    put('glucose_value', ext.glucose); put('glucose_unit', ext.glucoseUnit)
    put('weight_value', ext.weight); put('weight_unit', ext.weightUnit)
    put('temp_value', ext.temp); put('temp_unit', ext.tempUnit)
    put('spo2_value', ext.spo2); put('heart_rate', ext.heartRate)
    setVitals(ext); setVitalFields(f); setConf(c)
    setOverall(overallConfidence([ext.systolic, ext.diastolic, ext.pulse, ext.glucose, ext.weight, ext.temp, ext.spo2, ext.heartRate]))
    setRawExtract(ext)
    setStage('review-vitals')
  }

  async function captureVitals() {
    setStage('working'); setProgress({ status: 'starting', progress: 0 })
    try {
      const { canvas } = grabFrame()
      stopCamera()
      const text = await ocrImage(canvas, setProgress)
      const type = vitalHint ?? detectVitalType(text)
      const ext = parseDeviceScreenText(text, type)
      loadVitalsExtraction(ext, false)
    } catch (e: any) {
      setError(e?.message ?? 'Could not read the screen. Try again with better lighting.')
      setStage('error')
    }
  }

  async function saveVitals() {
    setSaving(true); setError(null)
    try {
      const capRes = await fetch('/api/scan-captures', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact: capMeta.artifact, method: capMeta.method, engine: capMeta.engine, raw_extract: rawExtract, overall_conf: overall }),
      })
      const capJson = await capRes.json().catch(() => ({}))
      const captureId = capJson?.capture?.id ?? null

      // Provenance: a verified QR reading is 'qr'-sourced; OCR is 'scan'-sourced.
      const source = capMeta.method === 'qr' ? 'qr' : 'scan'
      const payload: Record<string, unknown> = { type: vitalsType, source, capture_id: captureId }
      const num = (k: string) => vitalFields[k] ? Number(vitalFields[k]) : undefined
      if (vitalsType === 'blood_pressure') { payload.systolic = num('systolic'); payload.diastolic = num('diastolic'); if (vitalFields.pulse) payload.pulse = num('pulse') }
      if (vitalsType === 'glucose') { payload.glucose_value = num('glucose_value'); payload.glucose_unit = vitalFields.glucose_unit || 'mmol/L' }
      if (vitalsType === 'weight') { payload.weight_value = num('weight_value'); payload.weight_unit = vitalFields.weight_unit || 'kg' }
      if (vitalsType === 'temperature') { payload.temp_value = num('temp_value'); payload.temp_unit = vitalFields.temp_unit || '°C' }
      if (vitalsType === 'spo2') payload.spo2_value = num('spo2_value')
      if (vitalsType === 'heart_rate') payload.heart_rate = num('heart_rate')

      const res = await fetch('/api/vitals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not save the reading'); setSaving(false); return }
      setStage('saved')
    } catch {
      setError('Something went wrong saving the reading')
    } finally {
      setSaving(false)
    }
  }

  // ── Documents: capture photo → optional OCR title → upload ──────────
  async function captureDocument() {
    setStage('working'); setProgress({ status: 'capturing', progress: 0 })
    try {
      const { canvas, blob } = grabFrame()
      const b = await blob
      stopCamera()
      if (!b) throw new Error('Could not capture the image')
      shotRef.current = b
      setDocPreview(URL.createObjectURL(b))
      // Best-effort OCR to suggest a title (non-blocking failure).
      try {
        const text = await ocrImage(canvas, setProgress)
        const firstLine = text.split('\n').map(s => s.trim()).find(Boolean)
        if (firstLine) setDocTitle(firstLine.slice(0, 80))
      } catch { /* OCR optional for documents */ }
      setStage('review-doc')
    } catch (e: any) {
      setError(e?.message ?? 'Could not capture the document')
      setStage('error')
    }
  }

  async function saveDocument() {
    if (!shotRef.current) { setError('No captured image'); return }
    setSaving(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expired — please sign in again'); setSaving(false); return }
      const fname = `${(docTitle || 'scan').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)}.jpg`
      const path = `${user.id}/${Date.now()}_${fname}`

      const { error: upErr } = await supabase.storage
        .from('health-documents')
        .upload(path, shotRef.current, { contentType: 'image/jpeg', upsert: false })
      if (upErr) { setError(`Upload failed: ${upErr.message}`); setSaving(false); return }

      const capRes = await fetch('/api/scan-captures', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact: artifact === 'prescription' ? 'prescription' : 'document', method: 'on_device', engine: 'camera', status: 'reviewed' }),
      })
      const captureId = (await capRes.json().catch(() => ({})))?.capture?.id ?? null

      const res = await fetch('/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: docTitle || fname, file_type: 'image/jpeg', storage_path: path,
          file_size_bytes: shotRef.current.size, original_name: fname,
          category: docCategory, notes: docNotes, source: 'scan', capture_id: captureId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        await supabase.storage.from('health-documents').remove([path])
        setError(json.error ?? 'Could not save the document'); setSaving(false); return
      }
      setStage('saved')
    } catch {
      setError('Something went wrong saving the document')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { stopCamera(); router.back() }} className="text-gray-400 hover:text-gray-700" aria-label="Back">← Back</button>
        <h1 className="text-xl font-black text-gray-900">{ARTIFACT_LABEL[artifact]}</h1>
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}

      {stage === 'permission' && (
        <div className="card p-6 text-center space-y-4">
          <div className="text-5xl">📷</div>
          <p className="text-gray-600 text-sm">
            {artifact === 'device_screen' && 'Point your camera at the device screen (BP monitor, glucometer, oximeter, scale). Hold steady in good light.'}
            {artifact === 'medication' && 'Point your camera at the medication barcode on the box.'}
            {(artifact === 'prescription' || artifact === 'document') && 'Lay the document flat in good light and fill the frame.'}
          </p>
          <button onClick={startCamera} className="btn-primary">Open camera</button>
          {!barcodeDetectionSupported() && artifact === 'medication' && (
            <p className="text-xs text-amber-600">Barcode scanning isn’t supported in this browser. Try Chrome on Android.</p>
          )}
        </div>
      )}

      {stage === 'camera' && (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] sm:aspect-video">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-6 border-2 border-white/70 rounded-xl pointer-events-none" />
          </div>
          {artifact === 'medication' ? (
            <p className="text-center text-sm text-gray-500">Searching for a barcode…</p>
          ) : (
            <button onClick={artifact === 'device_screen' ? captureVitals : captureDocument} className="btn-primary w-full">
              📸 Capture
            </button>
          )}
        </div>
      )}

      {stage === 'working' && (
        <div className="card p-8 text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-2 border-brand-900 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-600">Reading… {progress ? `${Math.round((progress.progress ?? 0) * 100)}%` : ''}</p>
          <p className="text-xs text-gray-400">{progress?.status}</p>
        </div>
      )}

      {stage === 'review-vitals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Review before saving</p>
            <span className="text-xs text-gray-400">Confidence {Math.round(overall * 100)}%</span>
          </div>

          <div className="card p-4">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Reading type</label>
            <select className="input" value={vitalsType} onChange={e => setVitalsType(e.target.value as VitalType)}>
              <option value="blood_pressure">Blood Pressure</option>
              <option value="glucose">Glucose</option>
              <option value="weight">Weight</option>
              <option value="temperature">Temperature</option>
              <option value="spo2">SpO2</option>
              <option value="heart_rate">Heart Rate</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {fieldsFor(vitalsType).map(({ key, label, unit }) => (
              <ReviewField key={key} label={label} unit={unit}
                value={vitalFields[key] ?? ''} conf={conf[key]}
                onChange={v => setVitalFields(s => ({ ...s, [key]: v }))} />
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => startCamera()} disabled={saving} className="btn-secondary flex-1">Re-scan</button>
            <button onClick={saveVitals} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save reading'}</button>
          </div>
        </div>
      )}

      {stage === 'review-doc' && (
        <div className="space-y-4">
          {docPreview && <img src={docPreview} alt="Captured document" className="w-full rounded-2xl border border-gray-200" />}
          <div className="card p-4 space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Title</label>
              <input className="input" value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="e.g. Repeat script — Dr Nkosi" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
              <select className="input" value={docCategory} onChange={e => setDocCategory(e.target.value)}>
                {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
              <input className="input" value={docNotes} onChange={e => setDocNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => startCamera()} disabled={saving} className="btn-secondary flex-1">Re-take</button>
            <button onClick={saveDocument} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save document'}</button>
          </div>
        </div>
      )}

      {stage === 'barcode' && (
        <div className="card p-6 text-center space-y-4">
          <div className="text-4xl">📦</div>
          <p className="text-sm text-gray-600">Barcode detected</p>
          <p className="font-mono text-lg font-bold text-gray-900 break-all">{barcode}</p>
          <div className="flex gap-3">
            <button onClick={() => startCamera()} className="btn-secondary flex-1">Scan again</button>
            <button
              onClick={() => router.push(`/dashboard/medications?add=1&barcode=${encodeURIComponent(barcode ?? '')}`)}
              className="btn-primary flex-1"
            >
              Add medication
            </button>
          </div>
        </div>
      )}

      {stage === 'saved' && (
        <div className="card p-8 text-center space-y-4">
          <div className="text-5xl">✅</div>
          <p className="text-gray-700 font-semibold">Saved successfully</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setError(null); startCamera() }} className="btn-secondary">Scan another</button>
            <button onClick={() => router.push(artifact === 'device_screen' ? '/dashboard/vitals' : '/dashboard/records')} className="btn-primary">Done</button>
          </div>
        </div>
      )}

      {stage === 'error' && (
        <div className="text-center">
          <button onClick={startCamera} className="btn-primary">Try again</button>
        </div>
      )}
    </div>
  )
}

function fieldsFor(type: VitalType): { key: string; label: string; unit?: string }[] {
  switch (type) {
    case 'blood_pressure': return [{ key: 'systolic', label: 'Systolic', unit: 'mmHg' }, { key: 'diastolic', label: 'Diastolic', unit: 'mmHg' }, { key: 'pulse', label: 'Pulse', unit: 'bpm' }]
    case 'glucose':        return [{ key: 'glucose_value', label: 'Glucose', unit: 'mmol/L' }]
    case 'weight':         return [{ key: 'weight_value', label: 'Weight', unit: 'kg' }]
    case 'temperature':    return [{ key: 'temp_value', label: 'Temperature', unit: '°C' }]
    case 'spo2':           return [{ key: 'spo2_value', label: 'SpO2', unit: '%' }]
    case 'heart_rate':     return [{ key: 'heart_rate', label: 'Heart rate', unit: 'bpm' }]
  }
}

function ReviewField({ label, unit, value, conf, onChange }: {
  label: string; unit?: string; value: string; conf?: FieldConfidence; onChange: (v: string) => void
}) {
  return (
    <div className={`rounded-xl border-2 p-3 ${conf ? CONF_STYLE[conf] : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}{unit ? ` (${unit})` : ''}</label>
        {conf && <span className="text-[10px] font-semibold text-gray-500">{CONF_LABEL[conf]}</span>}
      </div>
      <input className="w-full bg-transparent text-lg font-bold text-gray-900 focus:outline-none"
        inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder="—" />
    </div>
  )
}
