// ── Concrete Ed25519 QR verifier for the mobile app ──────────────────
// Supplies the raw Ed25519 primitive (via @noble/ed25519, which runs in
// Hermes) to the shared, crypto-agnostic verifier. Holds the trusted key
// directory: a bundled fallback set plus keys refreshed from the backend.
//
// Requires: @noble/ed25519, @noble/hashes  (see package.json).

import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import {
  InMemoryKeyDirectory, makeVerifier, type Ed25519VerifyPrimitive, type IssuerKey,
  type VerifyFn,
} from '@vitatrack/shared'
import { getSupabaseClient } from '@vitatrack/shared'

// @noble/ed25519 v2 needs a SHA-512 implementation wired in once.
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m))

const nobleVerify: Ed25519VerifyPrimitive = (publicKey, message, signature) => {
  try {
    return ed.verify(signature, message, publicKey)
  } catch {
    return false // malformed key/sig → untrusted, never throws into the UI
  }
}

// Bundled fallback issuers so QR verification works offline / before first
// backend sync. Populate with the real published public keys.
const BUNDLED_KEYS: IssuerKey[] = [
  // { issuer: 'greenlab-jhb', publicKey: '<base64 32-byte Ed25519 public key>' },
]

const directory = new InMemoryKeyDirectory(BUNDLED_KEYS)

/** Refresh the trusted key directory from the backend (issuer → public key). */
export async function refreshTrustedKeys(): Promise<void> {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('qr_issuer_keys').select('issuer, public_key')
    if (error || !data) return
    directory.load(data.map((r: { issuer: string; public_key: string }) => ({
      issuer: r.issuer, publicKey: r.public_key,
    })))
  } catch {
    // Offline / not yet provisioned — keep the bundled keys.
  }
}

/** The VerifyFn the capture flow uses. */
export const verifyQrSignature: VerifyFn = makeVerifier(directory, nobleVerify)
