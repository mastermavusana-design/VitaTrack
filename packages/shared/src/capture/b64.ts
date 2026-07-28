// ── base64 / base64url helpers (no Buffer/atob dependency) ────────────
// Small, dependency-free, works in Hermes (RN), Node, and Deno edge.

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function decodeWith(alphabet: string, s: string): Uint8Array {
  const lookup: Record<string, number> = {}
  for (let i = 0; i < alphabet.length; i++) lookup[alphabet[i]] = i
  const clean = s.replace(/=+$/, '')
  const bytes: number[] = []
  let bits = 0
  let acc = 0
  for (const ch of clean) {
    const val = lookup[ch]
    if (val === undefined) throw new Error('invalid base64')
    acc = (acc << 6) | val
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((acc >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

function encodeWith(alphabet: string, bytes: Uint8Array, pad: boolean): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += alphabet[b0 >> 2]
    out += alphabet[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 === undefined) { if (pad) out += '=='; break }
    out += alphabet[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 === undefined) { if (pad) out += '='; break }
    out += alphabet[b2 & 63]
  }
  return out
}

/** Decode base64url (no padding). */
export const base64urlDecode = (s: string): Uint8Array => decodeWith(B64URL, s)

/** Decode standard base64 (with or without padding). */
export const base64Decode = (s: string): Uint8Array => decodeWith(B64STD, s)

/** Decode a key that may be either base64url or standard base64. */
export function base64AnyDecode(s: string): Uint8Array {
  return /[-_]/.test(s) ? base64urlDecode(s) : base64Decode(s)
}

/** Encode to base64url (no padding). */
export const base64urlEncode = (bytes: Uint8Array): string => encodeWith(B64URL, bytes, false)

/** UTF-8 decode with a minimal fallback for engines without TextDecoder. */
export function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i])
  try { return decodeURIComponent(escape(out)) } catch { return out }
}
