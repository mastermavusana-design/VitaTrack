import { describe, it, expect } from 'vitest'
import { parseReadingQR, verifyReadingQR, QR_SCHEME, type ReadingQRPayload } from './qr'
import { qrToExtraction } from './map'
import { gateVitals } from './validate'
import { field, overallConfidence, type VitalsExtraction } from './types'

// ── helpers to build a QR string (base64url, no signature crypto here) ──
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function b64url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]
    out += B64URL[b0 >> 2]
    out += B64URL[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 === undefined) break
    out += B64URL[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 === undefined) break
    out += B64URL[b2 & 63]
  }
  return out
}
function makeQr(payload: ReadingQRPayload, sig = 'AAAA'): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  return `${QR_SCHEME}.${b64url(bytes)}.${sig}`
}

const glucosePayload: ReadingQRPayload = {
  ver: 1, artifact: 'device_screen', iss: 'acme-glucometer', iat: 1_700_000_000,
  at: '2026-07-27T08:00:00Z', items: [{ k: 'glucose', v: 5.4, u: 'mmol/L' }],
}

describe('parseReadingQR', () => {
  it('parses a well-formed VitaTrack QR', () => {
    const res = parseReadingQR(makeQr(glucosePayload))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.parsed.payload.items[0].v).toBe(5.4)
  })

  it('rejects a non-VitaTrack barcode', () => {
    const res = parseReadingQR('https://example.com/whatever')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('bad_format')
  })

  it('flags an unsupported version', () => {
    const bad = makeQr({ ...glucosePayload, ver: 2 as unknown as 1 })
    const res = parseReadingQR(bad)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('unsupported_version')
  })
})

describe('verifyReadingQR', () => {
  it('passes when the injected verifier accepts the signature', async () => {
    const res = await verifyReadingQR(makeQr(glucosePayload), () => true)
    expect(res.ok).toBe(true)
  })
  it('fails a tampered / bad signature', async () => {
    const res = await verifyReadingQR(makeQr(glucosePayload), () => false)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('bad_signature')
  })
  it('rejects an expired QR even with a valid signature', async () => {
    const expired = makeQr({ ...glucosePayload, exp: 1_700_000_100 })
    const res = await verifyReadingQR(expired, () => true, 1_700_001_000)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('expired')
  })
})

describe('qrToExtraction', () => {
  it('maps a glucose QR to a high-confidence vitals extraction', () => {
    const ex = qrToExtraction(glucosePayload)
    expect(ex.method).toBe('qr')
    expect(ex.vitals?.type).toBe('glucose')
    expect(ex.vitals?.glucose?.value).toBe(5.4)
    expect(ex.vitals?.glucose?.confidence).toBe('high')
  })
  it('maps a BP QR to blood_pressure', () => {
    const bp: ReadingQRPayload = { ...glucosePayload, artifact: 'device_screen',
      items: [{ k: 'systolic', v: 128 }, { k: 'diastolic', v: 82 }, { k: 'pulse', v: 70 }] }
    const ex = qrToExtraction(bp)
    expect(ex.vitals?.type).toBe('blood_pressure')
    expect(ex.vitals?.systolic?.value).toBe(128)
  })
})

describe('gateVitals (range-based confidence)', () => {
  it('keeps a plausible reading high', () => {
    const v: VitalsExtraction = { type: 'blood_pressure', systolic: field(120, 'high'), diastolic: field(80, 'high') }
    const gated = gateVitals(v)
    expect(gated.systolic?.confidence).toBe('high')
  })
  it('demotes an implausible reading to low (misread digit guard)', () => {
    const v: VitalsExtraction = { type: 'blood_pressure', systolic: field(999, 'high') }
    const gated = gateVitals(v)
    expect(gated.systolic?.confidence).toBe('low')
  })
  it('demotes a glucose value implausible for its unit', () => {
    const v: VitalsExtraction = { type: 'glucose', glucose: field(540, 'high'), glucoseUnit: field('mmol/L', 'high') }
    const gated = gateVitals(v)
    expect(gated.glucose?.confidence).toBe('low') // 540 mmol/L is impossible
  })
})

describe('overallConfidence', () => {
  it('averages present field confidences', () => {
    expect(overallConfidence([field(1, 'high'), field(2, 'high')])).toBe(1)
    expect(overallConfidence([field(1, 'low')])).toBe(0.2)
    expect(overallConfidence([undefined, field(null, 'high')])).toBe(0)
  })
})
