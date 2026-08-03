// ── useCapture ───────────────────────────────────────────────────────
// Orchestrates the extraction paths behind the camera screen and returns
// the common ExtractionResult the review UI renders.
//
//   1. QR fast-path   — decode + verify a signed VitaTrack QR locally (offline, exact).
//   2. On-device path — every photo (device screens AND lab reports / prescriptions /
//                       documents) is read locally with ML Kit OCR. No image or PHI
//                       ever leaves the device — this is the POPIA-safe design.
//
// (A cloud vision path via the extract-reading Edge Function was removed on
//  2026-08-01 in favour of on-device-only extraction. See REMEDIATION_PLAN.md R6.)

import TextRecognition from '@react-native-ml-kit/text-recognition'
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

/**
 * On-device OCR for documents (lab reports / prescriptions / other docs).
 * ML Kit reads the text locally; we surface a best-effort vitals parse and flag
 * the result for manual review. Nothing is uploaded.
 */
async function extractDocumentOnDevice(imageUri: string, hint?: VitalType): Promise<ExtractionResult> {
  const recognized = await TextRecognition.recognize(imageUri)
  const text = recognized?.text ?? ''
  const vitals = gateVitals(parseDeviceScreenText(text, hint))
  const warnings = ['manual_review', ...(text.trim() === '' ? ['ocr_no_text'] : [])]
  return { artifact: 'document', method: 'on_device', engine: 'mlkit-text', vitals, warnings }
}

/** Main entry: given a captured photo, produce a reviewable ExtractionResult — fully on-device. */
export async function extractFromPhoto(
  artifact: CaptureArtifact,
  photo: { uri: string; base64?: string; mimeType?: string; vitalType?: VitalType },
): Promise<CaptureOutcome> {
  if (!photo.uri) return { kind: 'error', message: 'No image captured.' }
  try {
    const result = artifact === 'device_screen'
      ? await extractOnDevice(photo.uri, photo.vitalType)
      : await extractDocumentOnDevice(photo.uri, photo.vitalType)
    return { kind: 'ok', result }
  } catch (e) {
    return { kind: 'error', message: `On-device read failed: ${(e as Error).message}` }
  }
}
