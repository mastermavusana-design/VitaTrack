// ── useCapture ───────────────────────────────────────────────────────
// Orchestrates the three extraction paths behind the camera screen and
// returns the common ExtractionResult the review UI renders.
//
//   1. QR fast-path   — decode + verify a signed VitaTrack QR locally (offline, exact).
//   2. On-device path — device screens (glucometer/BP/…): ML Kit OCR, parsed locally.
//   3. Cloud path     — lab reports / prescriptions / documents via the
//                       extract-reading Edge Function (in-region).

import TextRecognition from '@react-native-ml-kit/text-recognition'
import { getSupabaseClient } from '@vitatrack/shared'
import {
  verifyReadingQR, qrToExtraction, parseReadingQR, gateVitals, parseDeviceScreenText,
  type ExtractionResult, type CaptureArtifact, type VitalType,
} from '@vitatrack/shared'
import { verifyQrSignature } from '@/lib/qrVerify'

export type CaptureOutcome =
  | { kind: 'ok'; result: ExtractionResult; unverifiedQr?: boolean }
  | { kind: 'error'; message: string }

/** Try to interpret a scanned barcode as a VitaTrack reading QR. */
export async function handleScannedQr(scanned: string): Promise<CaptureOutcome | null> {
  const verified = await verifyReadingQR(scanned, verifyQrSignature)
  if (verified.ok) {
    return { kind: 'ok', result: qrToExtraction(verified.payload) }
  }
  // Not a VitaTrack QR at all → let the caller ignore it (keep scanning).
  if (verified.error === 'not_vitatrack' || verified.error === 'bad_format') return null
  // It IS a VitaTrack QR but we couldn't verify it (unknown issuer / bad sig /
  // expired) → surface the data but flag it so review is mandatory.
  const structural = qrFromUnverified(scanned)
  if (structural) return { kind: 'ok', result: structural, unverifiedQr: true }
  return { kind: 'error', message: `Could not verify QR (${verified.error}).` }
}

// Parse-only fallback (no signature trust) so data can still be shown for review.
function qrFromUnverified(scanned: string): ExtractionResult | null {
  const parsed = parseReadingQR(scanned)
  if (!parsed.ok) return null
  const res = qrToExtraction(parsed.parsed.payload)
  res.method = 'qr'
  res.warnings = [...res.warnings, 'unverified_signature']
  if (res.vitals) res.vitals = demoteVitals(res.vitals)
  return res
}

function demoteVitals(v: NonNullable<ExtractionResult['vitals']>): NonNullable<ExtractionResult['vitals']> {
  const out = { ...v }
  for (const k of Object.keys(out) as (keyof typeof out)[]) {
    const f = out[k] as { confidence?: string } | undefined
    if (f && typeof f === 'object' && 'confidence' in f && f.confidence === 'high') {
      ;(f as { confidence: string }).confidence = 'medium'
    }
  }
  return out
}

/** On-device OCR for device screens — ML Kit reads the frame, we parse locally. Fully offline. */
async function extractOnDevice(imageUri: string, hint?: VitalType): Promise<ExtractionResult> {
  const recognized = await TextRecognition.recognize(imageUri)
  const text = recognized?.text ?? ''
  const vitals = gateVitals(parseDeviceScreenText(text, hint))
  const warnings = text.trim() === '' ? ['ocr_no_text'] : []
  return { artifact: 'device_screen', method: 'on_device', engine: 'mlkit-text', vitals, warnings }
}

/** Cloud extraction via the in-region Edge Function. */
async function extractCloud(artifact: CaptureArtifact, imageBase64: string, mimeType: string): Promise<CaptureOutcome> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke('extract-reading', {
    body: { artifact, imageBase64, mimeType },
  })
  if (error) return { kind: 'error', message: error.message }
  const result = data as ExtractionResult
  if (result.vitals) result.vitals = gateVitals(result.vitals)
  return { kind: 'ok', result }
}

/** Main entry: given a captured photo, produce a reviewable ExtractionResult. */
export async function extractFromPhoto(
  artifact: CaptureArtifact,
  photo: { uri: string; base64?: string; mimeType?: string; vitalType?: VitalType },
): Promise<CaptureOutcome> {
  if (artifact === 'device_screen') {
    try {
      const result = await extractOnDevice(photo.uri, photo.vitalType)
      return { kind: 'ok', result }
    } catch (e) {
      return { kind: 'error', message: `On-device read failed: ${(e as Error).message}` }
    }
  }
  if (!photo.base64) return { kind: 'error', message: 'No image data captured.' }
  return extractCloud(artifact, photo.base64, photo.mimeType ?? 'image/jpeg')
}
