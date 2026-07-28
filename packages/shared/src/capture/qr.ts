// ── VitaTrack Reading QR — parse & verify ────────────────────────────
// A provider (device, lab, pharmacy, radiology) can print a compact,
// SIGNED QR next to a printed reading. Scanning it gives a perfect,
// zero-OCR, offline import. Full rationale + adoption plan live in
// docs/features/vitatrack-reading-qr-standard.md.
//
// Wire format (string encoded in the QR):
//   VT1.<base64url(payloadJSON)>.<base64url(signature)>
//
//   - "VT1" is the scheme + version tag (lets us evolve the format).
//   - payloadJSON is a ReadingQRPayload (below).
//   - signature is Ed25519 over the UTF-8 bytes of the payloadJSON,
//     produced by the provider's private key. The app holds the matching
//     public keys (a small trusted key directory) and verifies offline.
//
// Verification is injected (VerifyFn) so this module stays dependency-free
// and runs unchanged on the phone (expo-crypto) and in Edge Functions
// (WebCrypto). Signature checking is what stops a spoofed/edited QR from
// injecting fake clinical data.

import type { CaptureArtifact } from './types'
import { base64urlDecode, utf8Decode } from './b64'

export const QR_SCHEME = 'VT1'

/** A single reading inside a QR (kept generic so one schema covers all artifacts). */
export type ReadingQRItem = {
  /** Analyte / vital key, e.g. 'glucose', 'systolic', 'HbA1c', 'LDL'. */
  k: string
  /** Numeric or textual value. */
  v: number | string
  /** Unit, e.g. 'mmol/L', 'mmHg', '%'. */
  u?: string
  /** Reference range low/high, if the provider prints one. */
  lo?: number
  hi?: number
  /** LOINC (labs) or other standard code, optional. */
  code?: string
}

export type ReadingQRPayload = {
  /** Payload schema version. */
  ver: 1
  /** What kind of artifact produced this. */
  artifact: CaptureArtifact
  /** Issuer id — must match a key in the trusted key directory. */
  iss: string
  /** Issued-at (unix seconds). */
  iat: number
  /** Optional expiry (unix seconds); after this the QR is stale. */
  exp?: number
  /** When the reading was actually taken (ISO 8601). */
  at?: string
  /** The readings. */
  items: ReadingQRItem[]
  /** Optional free-text label (drug name, panel name, facility). */
  label?: string
  /** Optional opaque patient-scoped nonce to bind the QR to one hand-out. */
  nonce?: string
}

export type ParsedReadingQR = {
  scheme: string
  payload: ReadingQRPayload
  /** Raw UTF-8 bytes that the signature covers (verify against these). */
  signedBytes: Uint8Array
  signature: Uint8Array
}

export type QRParseError =
  | { ok: false; error: 'not_vitatrack' | 'bad_format' | 'bad_payload' | 'unsupported_version' }

export type QRParseOk = { ok: true; parsed: ParsedReadingQR }
export type QRParseResult = QRParseOk | QRParseError

/** Structurally parse a scanned string into a ReadingQR (no signature check yet). */
export function parseReadingQR(scanned: string): QRParseResult {
  const parts = scanned.trim().split('.')
  if (parts.length !== 3) return { ok: false, error: 'bad_format' }
  const [scheme, payloadB64, sigB64] = parts
  if (scheme !== QR_SCHEME) return { ok: false, error: 'not_vitatrack' }

  let signedBytes: Uint8Array
  let signature: Uint8Array
  let payload: ReadingQRPayload
  try {
    signedBytes = base64urlDecode(payloadB64)
    signature = base64urlDecode(sigB64)
    payload = JSON.parse(utf8Decode(signedBytes)) as ReadingQRPayload
  } catch {
    return { ok: false, error: 'bad_payload' }
  }

  if (payload?.ver !== 1) return { ok: false, error: 'unsupported_version' }
  if (!Array.isArray(payload.items) || typeof payload.iss !== 'string') {
    return { ok: false, error: 'bad_payload' }
  }
  return { ok: true, parsed: { scheme, payload, signedBytes, signature } }
}

/** Signature verifier: returns true iff `signature` is a valid signature over `message` for `issuer`. */
export type VerifyFn = (
  issuer: string,
  message: Uint8Array,
  signature: Uint8Array,
) => Promise<boolean> | boolean

export type QRVerifyResult =
  | { ok: true; payload: ReadingQRPayload }
  | { ok: false; error: 'not_vitatrack' | 'bad_format' | 'bad_payload' | 'unsupported_version'
       | 'unknown_issuer' | 'bad_signature' | 'expired' }

/**
 * Full verification: structure → issuer known → signature valid → not expired.
 * `verify` is injected so the crypto lives in the app/edge layer.
 */
export async function verifyReadingQR(
  scanned: string,
  verify: VerifyFn,
  now: number = Math.floor(Date.now() / 1000),
): Promise<QRVerifyResult> {
  const parsed = parseReadingQR(scanned)
  if (!parsed.ok) return parsed
  const { payload, signedBytes, signature } = parsed.parsed

  let valid: boolean
  try {
    valid = await verify(payload.iss, signedBytes, signature)
  } catch {
    return { ok: false, error: 'unknown_issuer' }
  }
  if (!valid) return { ok: false, error: 'bad_signature' }
  if (payload.exp != null && now > payload.exp) return { ok: false, error: 'expired' }

  return { ok: true, payload }
}
