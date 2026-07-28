#!/usr/bin/env node
// ── VitaTrack Reading QR — issuer signer CLI ─────────────────────────
// Mint a test issuer keypair, sign a VT1 reading QR, render a scannable
// QR you can point the app at, and verify. Pure node:crypto — no deps.
//
// Wire format (matches packages/shared/src/capture/qr.ts):
//   VT1.<base64url(payloadJSON)>.<base64url(ed25519 signature)>
//
// Commands:
//   node scripts/qr-signer.mjs keygen <issuer>
//       → writes <issuer>.issuer.json (public + private key), prints the
//         SQL to register the public key and a bundled-keys snippet.
//
//   node scripts/qr-signer.mjs sign --key <file> [reading flags] [--out qr.html]
//       reading flags (pick one shape):
//         --glucose 5.4[:mmol/L]        glucometer reading
//         --bp 128/82/70                systolic/diastolic/pulse
//         --weight 70.5[:kg]            scale
//         --temp 36.6[:°C]             thermometer
//         --spo2 98[/72]                SpO2[/pulse]
//         --lab HbA1c=6.4:% [--lab LDL=3.1:mmol/L ...]   lab analytes
//         --item k=v[:unit]             free-form (repeatable)
//       options: --artifact <t> --at <ISO> --exp <unixSeconds> --label <s> --out <file.html>
//       → prints the VT1 string and writes a scannable QR HTML page.
//
//   node scripts/qr-signer.mjs verify --key <file> "<VT1 string>"
//       → verifies the signature + expiry locally.
//
//   node scripts/qr-signer.mjs demo
//       → one-shot: in-memory keypair + sample glucose QR + qr-demo.html.

import { generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'

const QR_SCHEME = 'VT1'
const b64url = (buf) => Buffer.from(buf).toString('base64url')
const fromB64url = (s) => new Uint8Array(Buffer.from(s, 'base64url'))

// ── key helpers ──────────────────────────────────────────────
function newKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = publicKey.export({ format: 'jwk' })            // { kty:'OKP', crv:'Ed25519', x:<b64url> }
  const publicKeyB64 = Buffer.from(jwk.x, 'base64url').toString('base64') // raw 32-byte key, std base64
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  return { publicKeyB64, privateKeyPem }
}

function loadKeyfile(path) {
  const k = JSON.parse(readFileSync(path, 'utf8'))
  if (!k.issuer || !k.privateKeyPem || !k.publicKeyB64) throw new Error(`bad keyfile: ${path}`)
  return k
}

// ── payload / signing ────────────────────────────────────────
function signPayload(payload, privateKeyPem) {
  const json = JSON.stringify(payload)
  const msg = Buffer.from(json, 'utf8')
  const sig = edSign(null, msg, privateKeyPem)
  return `${QR_SCHEME}.${b64url(msg)}.${b64url(sig)}`
}

function verifyString(vt, publicKeyB64, now = Math.floor(Date.now() / 1000)) {
  const parts = vt.trim().split('.')
  if (parts.length !== 3 || parts[0] !== QR_SCHEME) return { ok: false, error: 'bad_format' }
  const msg = Buffer.from(fromB64url(parts[1]))
  const sig = Buffer.from(fromB64url(parts[2]))
  const rawPub = Buffer.from(publicKeyB64, 'base64')
  const pub = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: rawPub.toString('base64url') }, format: 'jwk' })
  if (!edVerify(null, msg, pub, sig)) return { ok: false, error: 'bad_signature' }
  const payload = JSON.parse(msg.toString('utf8'))
  if (payload.exp != null && now > payload.exp) return { ok: false, error: 'expired' }
  return { ok: true, payload }
}

// ── flag parsing ─────────────────────────────────────────────
function parseFlags(argv) {
  const flags = {}
  const labs = []
  const items = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const val = argv[i + 1]
    if (key === 'lab') { labs.push(val); i++ }
    else if (key === 'item') { items.push(val); i++ }
    else { flags[key] = val; i++ }
  }
  return { flags, labs, items }
}

function itemFromKV(kv) {
  // "HbA1c=6.4:%"  or  "drug=Metformin"
  const [k, rest] = kv.split('=')
  const [v, u] = (rest ?? '').split(':')
  const num = Number(v)
  return { k, v: Number.isFinite(num) && v !== '' ? num : v, ...(u ? { u } : {}) }
}

function buildItems(flags, labs, items) {
  if (flags.glucose) { const [v, u] = flags.glucose.split(':'); return { artifact: 'device_screen', items: [{ k: 'glucose', v: Number(v), u: u ?? 'mmol/L' }] } }
  if (flags.bp) { const [s, d, p] = flags.bp.split('/').map(Number); const it = [{ k: 'systolic', v: s, u: 'mmHg' }, { k: 'diastolic', v: d, u: 'mmHg' }]; if (p) it.push({ k: 'pulse', v: p, u: 'bpm' }); return { artifact: 'device_screen', items: it } }
  if (flags.weight) { const [v, u] = flags.weight.split(':'); return { artifact: 'device_screen', items: [{ k: 'weight', v: Number(v), u: u ?? 'kg' }] } }
  if (flags.temp) { const [v, u] = flags.temp.split(':'); return { artifact: 'device_screen', items: [{ k: 'temp', v: Number(v), u: u ?? '°C' }] } }
  if (flags.spo2) { const [v, p] = flags.spo2.split('/').map(Number); const it = [{ k: 'spo2', v, u: '%' }]; if (p) it.push({ k: 'heart_rate', v: p, u: 'bpm' }); return { artifact: 'device_screen', items: it } }
  if (labs.length) return { artifact: 'lab_report', items: labs.map(itemFromKV) }
  if (items.length) return { artifact: 'document', items: items.map(itemFromKV) }
  return null
}

// ── scannable QR HTML (renders client-side via CDN, nothing sent anywhere) ──
function writeQrHtml(vt, path, meta) {
  const html = `<!doctype html><meta charset="utf-8"><title>VitaTrack test QR</title>
<body style="font-family:system-ui;max-width:520px;margin:40px auto;text-align:center;color:#1E293B">
<h2>VitaTrack Reading QR</h2>
<p style="color:#64748B">${meta}</p>
<div id="qr" style="display:inline-block;padding:16px;background:#fff;border:1px solid #E0E4EA;border-radius:12px"></div>
<p style="word-break:break-all;font-size:12px;color:#94A3B8;margin-top:16px">${vt}</p>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
<script>QRCode.toCanvas(document.createElement('canvas'),${JSON.stringify(vt)},{width:320,margin:2},
 (e,c)=>{if(!e)document.getElementById('qr').appendChild(c)})</script>
</body>`
  writeFileSync(path, html)
}

// ── commands ─────────────────────────────────────────────────
function cmdKeygen(issuer) {
  if (!issuer) { console.error('usage: keygen <issuer>'); process.exit(1) }
  const { publicKeyB64, privateKeyPem } = newKeypair()
  const file = `${issuer}.issuer.json`
  writeFileSync(file, JSON.stringify({ issuer, publicKeyB64, privateKeyPem }, null, 2))
  console.log(`\n✔ keypair for issuer "${issuer}" → ${file}  (keep the private key secret)\n`)
  console.log('Public key (base64):', publicKeyB64, '\n')
  console.log('Register it — SQL (run against Supabase):')
  console.log(`  INSERT INTO qr_issuer_keys (issuer, public_key, name)\n  VALUES ('${issuer}', '${publicKeyB64}', '${issuer}');\n`)
  console.log('…or add to the app bundled fallback (apps/mobile/lib/qrVerify.ts):')
  console.log(`  { issuer: '${issuer}', publicKey: '${publicKeyB64}' },\n`)
}

function cmdSign(argv) {
  const { flags, labs, items } = parseFlags(argv)
  if (!flags.key) { console.error('usage: sign --key <file> [reading flags] [--out qr.html]'); process.exit(1) }
  const key = loadKeyfile(flags.key)
  const built = buildItems(flags, labs, items)
  if (!built) { console.error('no reading given — use --glucose / --bp / --weight / --temp / --spo2 / --lab / --item'); process.exit(1) }
  const payload = {
    ver: 1,
    artifact: flags.artifact ?? built.artifact,
    iss: key.issuer,
    iat: Math.floor(Date.now() / 1000),
    ...(flags.exp ? { exp: Number(flags.exp) } : {}),
    at: flags.at ?? new Date().toISOString(),
    ...(flags.label ? { label: flags.label } : {}),
    items: built.items,
  }
  const vt = signPayload(payload, key.privateKeyPem)
  console.log('\nVT1 string:\n' + vt + '\n')
  const out = flags.out ?? 'qr.html'
  writeQrHtml(vt, out, `${payload.artifact} · issuer ${key.issuer}`)
  console.log(`✔ scannable QR → ${out}  (open in a browser, scan with the app)\n`)
  // self-check
  const chk = verifyString(vt, key.publicKeyB64)
  console.log('self-verify:', chk.ok ? 'OK' : `FAILED (${chk.error})`)
}

function cmdVerify(argv) {
  const { flags } = parseFlags(argv)
  const vt = argv.find(a => a.startsWith(`${QR_SCHEME}.`))
  if (!flags.key || !vt) { console.error('usage: verify --key <file> "<VT1 string>"'); process.exit(1) }
  const key = loadKeyfile(flags.key)
  const res = verifyString(vt, key.publicKeyB64)
  console.log(res.ok ? '✔ VALID' : `✗ INVALID (${res.error})`)
  if (res.ok) console.log(JSON.stringify(res.payload, null, 2))
  process.exit(res.ok ? 0 : 1)
}

function cmdDemo() {
  const { publicKeyB64, privateKeyPem } = newKeypair()
  const issuer = 'demo-clinic'
  const payload = {
    ver: 1, artifact: 'device_screen', iss: issuer,
    iat: Math.floor(Date.now() / 1000), at: new Date().toISOString(),
    label: 'Fasting glucose', items: [{ k: 'glucose', v: 5.4, u: 'mmol/L' }],
  }
  const vt = signPayload(payload, privateKeyPem)
  writeQrHtml(vt, 'qr-demo.html', `${payload.artifact} · issuer ${issuer}`)
  console.log('\n── VitaTrack QR demo ──\n')
  console.log('issuer      :', issuer)
  console.log('public key  :', publicKeyB64)
  console.log('VT1 string  :', vt)
  console.log('\nAdd this key so the app trusts it:')
  console.log(`  INSERT INTO qr_issuer_keys (issuer, public_key, name) VALUES ('${issuer}', '${publicKeyB64}', 'Demo Clinic');`)
  console.log(`  // or bundled: { issuer: '${issuer}', publicKey: '${publicKeyB64}' }`)
  console.log('\n✔ scannable QR → qr-demo.html')
  console.log('self-verify :', verifyString(vt, publicKeyB64).ok ? 'OK' : 'FAILED', '\n')
}

// ── dispatch ─────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2)
switch (cmd) {
  case 'keygen': cmdKeygen(rest[0]); break
  case 'sign':   cmdSign(rest); break
  case 'verify': cmdVerify(rest); break
  case 'demo':   cmdDemo(); break
  default:
    console.log('VitaTrack QR signer\n  commands: keygen <issuer> | sign --key <f> [reading] | verify --key <f> "<VT1>" | demo')
}
