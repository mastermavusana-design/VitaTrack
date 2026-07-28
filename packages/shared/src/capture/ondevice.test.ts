import { describe, it, expect } from 'vitest'
import { createPublicKey, generateKeyPairSync, sign as nodeSign, verify as nodeVerify, type KeyObject } from 'node:crypto'
import { parseDeviceScreenText, detectVitalType } from './deviceScreen'
import { gateVitals } from './validate'
import { InMemoryKeyDirectory, makeVerifier, type Ed25519VerifyPrimitive } from './ed25519'
import { verifyReadingQR, QR_SCHEME, type ReadingQRPayload } from './qr'
import { base64urlEncode } from './b64'

// ─────────────────────────────────────────────────────────────
// On-device device-screen parsing
// ─────────────────────────────────────────────────────────────
describe('parseDeviceScreenText', () => {
  it('reads a labelled BP monitor', () => {
    const v = parseDeviceScreenText('SYS 128 mmHg\nDIA 82\nPUL 70')
    expect(v.type).toBe('blood_pressure')
    expect(v.systolic?.value).toBe(128)
    expect(v.diastolic?.value).toBe(82)
    expect(v.pulse?.value).toBe(70)
    expect(v.systolic?.confidence).toBe('high') // mmHg/SYS present
  })

  it('reads an unlabelled BP screen using the hint', () => {
    const v = parseDeviceScreenText('128\n82\n70', 'blood_pressure')
    expect(v.systolic?.value).toBe(128)
    expect(v.diastolic?.value).toBe(82)
    expect(v.systolic?.confidence).toBe('medium') // inferred, no unit label
  })

  it('reads a glucometer in mmol/L', () => {
    const v = parseDeviceScreenText('5.4 mmol/L')
    expect(v.type).toBe('glucose')
    expect(v.glucose?.value).toBe(5.4)
    expect(v.glucoseUnit?.value).toBe('mmol/L')
    expect(v.glucose?.confidence).toBe('high')
  })

  it('reads a glucometer in mg/dL', () => {
    const v = parseDeviceScreenText('Glu 98 mg/dL')
    expect(v.type).toBe('glucose')
    expect(v.glucose?.value).toBe(98)
    expect(v.glucoseUnit?.value).toBe('mg/dL')
  })

  it('reads a scale with a European decimal comma', () => {
    const v = parseDeviceScreenText('70,5 kg')
    expect(v.type).toBe('weight')
    expect(v.weight?.value).toBe(70.5)
    expect(v.weightUnit?.value).toBe('kg')
  })

  it('reads a thermometer', () => {
    const v = parseDeviceScreenText('TEMP 36.6 °C')
    expect(v.type).toBe('temperature')
    expect(v.temp?.value).toBe(36.6)
    expect(v.tempUnit?.value).toBe('°C')
  })

  it('reads a pulse oximeter (SpO2 + pulse)', () => {
    const v = parseDeviceScreenText('SpO2 98 %\nPR 72 bpm')
    expect(v.type).toBe('spo2')
    expect(v.spo2?.value).toBe(98)
    expect(v.heartRate?.value).toBe(72)
  })

  it('demotes an OCR misread once gated (e.g. 188/82 read as 1888/82)', () => {
    const raw = parseDeviceScreenText('SYS 1888 mmHg\nDIA 82')
    const gated = gateVitals(raw)
    expect(gated.systolic?.confidence).toBe('low') // 1888 is out of range → flagged red for review
    expect(gated.diastolic?.confidence).toBe('high')
  })

  it('detectVitalType infers from units without a hint', () => {
    expect(detectVitalType('98 %\nSpO2')).toBe('spo2')
    expect(detectVitalType('120/80 mmHg')).toBe('blood_pressure')
    expect(detectVitalType('6.1 mmol/L')).toBe('glucose')
  })
})

// ─────────────────────────────────────────────────────────────
// Ed25519 QR verification — full chain against REAL signatures
// (Node's crypto is the injected primitive; the app uses @noble/ed25519)
// ─────────────────────────────────────────────────────────────

// Extract the raw 32-byte Ed25519 public key from a Node KeyObject (via JWK).
function rawPublicKey(pub: KeyObject): Uint8Array {
  const jwk = pub.export({ format: 'jwk' }) as { x: string }
  // jwk.x is base64url of the 32-byte key.
  return new Uint8Array(Buffer.from(jwk.x, 'base64url'))
}
function nodePublicKeyFromRaw(raw: Uint8Array): KeyObject {
  const x = Buffer.from(raw).toString('base64url')
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' } as never)
}

// The injected primitive used by tests (real Ed25519 verify via Node).
const nodePrimitive: Ed25519VerifyPrimitive = (publicKey, message, signature) =>
  nodeVerify(null, Buffer.from(message), nodePublicKeyFromRaw(publicKey), Buffer.from(signature))

function makeSignedQr(payload: ReadingQRPayload, priv: KeyObject): string {
  const json = JSON.stringify(payload)
  const msg = Buffer.from(json, 'utf8')
  const sig = nodeSign(null, msg, priv)
  return `${QR_SCHEME}.${base64urlEncode(new Uint8Array(msg))}.${base64urlEncode(new Uint8Array(sig))}`
}

describe('Ed25519 verifyReadingQR (real signatures)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pubRaw = rawPublicKey(publicKey)
  const directory = new InMemoryKeyDirectory([
    { issuer: 'greenlab-jhb', publicKey: Buffer.from(pubRaw).toString('base64') },
  ])
  const verify = makeVerifier(directory, nodePrimitive)

  const payload: ReadingQRPayload = {
    ver: 1, artifact: 'lab_report', iss: 'greenlab-jhb', iat: 1753600000,
    at: '2026-07-26T09:30:00Z', items: [{ k: 'HbA1c', v: 6.4, u: '%' }],
  }

  it('accepts a correctly signed QR from a known issuer', async () => {
    const res = await verifyReadingQR(makeSignedQr(payload, privateKey), verify)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.payload.items[0].k).toBe('HbA1c')
  })

  it('rejects a tampered payload (signature no longer matches)', async () => {
    const qr = makeSignedQr(payload, privateKey)
    // Flip the payload segment to a different value while keeping the old signature.
    const forged = makeSignedQr({ ...payload, items: [{ k: 'HbA1c', v: 5.0, u: '%' }] }, privateKey)
    const tampered = qr.split('.')[0] + '.' + forged.split('.')[1] + '.' + qr.split('.')[2]
    const res = await verifyReadingQR(tampered, verify)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('bad_signature')
  })

  it('rejects an unknown issuer', async () => {
    const res = await verifyReadingQR(makeSignedQr({ ...payload, iss: 'not-registered' }, privateKey), verify)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('unknown_issuer')
  })

  it('rejects a signature from the wrong key', async () => {
    const other = generateKeyPairSync('ed25519')
    const res = await verifyReadingQR(makeSignedQr(payload, other.privateKey), verify)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('bad_signature')
  })

  it('rejects an expired QR even with a valid signature', async () => {
    const expired = { ...payload, exp: 1753600100 }
    const res = await verifyReadingQR(makeSignedQr(expired, privateKey), verify, 1753601000)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('expired')
  })
})
