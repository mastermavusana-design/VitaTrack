// ── Ed25519 QR verification ──────────────────────────────────────────
// Builds a VerifyFn (consumed by verifyReadingQR) from:
//   1. a TrustedKeyDirectory  — issuer id → Ed25519 public key (32 bytes), and
//   2. an injected Ed25519VerifyPrimitive — the raw curve verify.
//
// The primitive is injected so this module stays crypto-library-agnostic:
//   - the mobile app supplies it via @noble/ed25519 (works in Hermes),
//   - the web app / edge can supply WebCrypto,
//   - tests supply Node's built-in crypto — so the whole chain is verified
//     against REAL Ed25519 signatures with no extra dependency.
//
// An unknown issuer THROWS (verifyReadingQR maps that to 'unknown_issuer');
// a valid-but-wrong signature returns false ('bad_signature'). Either way an
// unverifiable QR is never silently trusted — see the capture spec §9.

import type { VerifyFn } from './qr'
import { base64AnyDecode } from './b64'

/** issuer id → raw 32-byte Ed25519 public key. */
export interface TrustedKeyDirectory {
  getKey(issuer: string): Uint8Array | null
}

/** The raw Ed25519 verification primitive: does `signature` sign `message` under `publicKey`? */
export type Ed25519VerifyPrimitive = (
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
) => Promise<boolean> | boolean

export type IssuerKey = { issuer: string; publicKey: string /* base64 or base64url, 32 bytes */ }

/** Simple in-memory key directory, hydrated from a list (bundled + backend refresh). */
export class InMemoryKeyDirectory implements TrustedKeyDirectory {
  private keys = new Map<string, Uint8Array>()

  constructor(initial: IssuerKey[] = []) {
    this.load(initial)
  }

  /** Replace/extend the directory (e.g. after a refresh from the backend). */
  load(keys: IssuerKey[]): void {
    for (const k of keys) {
      try {
        this.keys.set(k.issuer, base64AnyDecode(k.publicKey))
      } catch {
        // Skip malformed key entries rather than poisoning the directory.
      }
    }
  }

  getKey(issuer: string): Uint8Array | null {
    return this.keys.get(issuer) ?? null
  }
}

/** Build a VerifyFn from a key directory + a raw Ed25519 verify primitive. */
export function makeVerifier(
  directory: TrustedKeyDirectory,
  primitive: Ed25519VerifyPrimitive,
): VerifyFn {
  return async (issuer, message, signature) => {
    const publicKey = directory.getKey(issuer)
    if (!publicKey) throw new Error(`unknown issuer: ${issuer}`) // → 'unknown_issuer'
    return primitive(publicKey, message, signature)
  }
}
