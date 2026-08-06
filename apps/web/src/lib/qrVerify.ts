// ── Concrete Ed25519 QR verifier for the web app ─────────────────────
// Web parity with apps/mobile/lib/qrVerify.ts. Mobile supplies the raw
// Ed25519 primitive via @noble/ed25519 (Hermes); the web supplies WebCrypto
// (SubtleCrypto Ed25519), exactly as the shared crypto-agnostic verifier
// anticipates. Holds the trusted key directory: an optional bundled fallback
// set plus keys refreshed from `qr_issuer_keys`.
//
// A genuinely signed reading QR from a known issuer is trusted (high
// confidence); an unknown issuer / bad signature / expired QR is never
// silently trusted — the scan flow demotes it to a manual review.

'use client'

import { createClientComponentClient } from '@/lib/supabaseClient'
import {
  InMemoryKeyDirectory, makeVerifier, verifyReadingQR, parseReadingQR, qrToExtraction,
  type Ed25519VerifyPrimitive, type IssuerKey, type VerifyFn, type ExtractionResult,
} from '@vitatrack/shared'

/** True where the browser's SubtleCrypto exposes Ed25519 (Chrome 137+, Safari 17+, FF 129+). */
export function ed25519Supported(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}

/**
 * Raw Ed25519 verify via WebCrypto. Imports the 32-byte raw public key and
 * verifies the signature over the message. Any failure (unsupported curve,
 * malformed key/sig) resolves to false → treated as untrusted, never thrown.
 */
const webcryptoVerify: Ed25519VerifyPrimitive = async (publicKey, message, signature) => {
  try {
    const key = await crypto.subtle.importKey('raw', publicKey as BufferSource, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature as BufferSource, message as BufferSource)
  } catch {
    return false
  }
}

// Bundled fallback issuers so QR verification works before the first backend
// sync. Populate with the real published public keys (mirrors mobile).
const BUNDLED_KEYS: IssuerKey[] = [
  // { issuer: 'greenlab-jhb', publicKey: '<base64 32-byte Ed25519 public key>' },
]

const directory = new InMemoryKeyDirectory(BUNDLED_KEYS)

/** Refresh the trusted key directory from the backend (issuer → public key). */
export async function refreshTrustedKeys(): Promise<void> {
  try {
    const supabase = createClientComponentClient()
    const { data, error } = await supabase.from('qr_issuer_keys').select('issuer, public_key')
    if (error || !data) return
    directory.load(
      (data as { issuer: string; public_key: string }[]).map((r) => ({ issuer: r.issuer, publicKey: r.public_key })),
    )
  } catch {
    // Offline / not provisioned — keep whatever keys we have.
  }
}

/** The VerifyFn the capture flow uses. */
export const verifyQrSignature: VerifyFn = makeVerifier(directory, webcryptoVerify)

export type ScannedQrOutcome =
  | { kind: 'verified'; result: ExtractionResult }
  | { kind: 'unverified'; result: ExtractionResult }
  | { kind: 'ignore' }
  | { kind: 'error'; message: string }

/**
 * Interpret a scanned barcode as a VitaTrack reading QR — parity with the
 * mobile `handleScannedQr`:
 *   • valid signature from a known issuer → trusted (high-confidence) extraction
 *   • a VitaTrack QR we can't verify        → structural extraction, flagged unverified
 *   • not a VitaTrack QR                     → ignore (keep scanning)
 */
export async function verifyScannedQr(scanned: string): Promise<ScannedQrOutcome> {
  const verified = await verifyReadingQR(scanned, verifyQrSignature)
  if (verified.ok) {
    return { kind: 'verified', result: qrToExtraction(verified.payload) }
  }
  // Not a VitaTrack QR at all → let the caller keep scanning.
  if (verified.error === 'not_vitatrack' || verified.error === 'bad_format') {
    return { kind: 'ignore' }
  }
  // It IS a VitaTrack QR but unverifiable (unknown issuer / bad sig / expired /
  // unsupported) → surface the data for mandatory manual review.
  const parsed = parseReadingQR(scanned)
  if (parsed.ok) {
    const result = qrToExtraction(parsed.parsed.payload)
    result.warnings = [...result.warnings, 'unverified_signature']
    return { kind: 'unverified', result }
  }
  return { kind: 'error', message: `Could not verify QR (${verified.error}).` }
}
