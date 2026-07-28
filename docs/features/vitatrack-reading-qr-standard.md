# VitaTrack Reading QR — an open standard for zero-error data hand-off

**Status:** Proposal / discussion draft
**Audience:** VitaTrack team + prospective partner clinics, labs, pharmacies, and device makers
**Date:** 2026-07-27
**Companion:** `camera-capture-spec.md` (the app-side capture feature this builds on)

---

## The one-paragraph pitch

VitaTrack already lets a patient photograph a reading — a glucometer screen, a lab report, a
prescription — and have the numbers extracted automatically. OCR is good, but paper is messy: glare,
handwriting, and odd layouts mean some reads need a human check. **If a provider prints a small,
signed QR code next to the reading, that ambiguity disappears entirely.** The patient scans it, and
the exact values flow into their record — correct units, reference ranges, timestamp, and all — with
no typing and no OCR guesswork. It is the difference between "read the receipt" and "scan the barcode
at checkout." This document proposes an open, signed QR format any provider can adopt.

---

## Is it worth building? Short answer: yes — but sequenced correctly

**Build the camera OCR now; treat the QR as the upgrade path, not a prerequisite.** Here's the reasoning.

**What makes it worth it**

- **It removes the last mile of error** on the highest-stakes data. A wrong glucose or dose that
  enters a health record silently is the single worst failure mode of OCR. A signed QR is exact by
  construction, and its signature means a patient can *trust* the data came from the real provider.
- **It's cheap for providers.** Any system that already prints a result can add a QR — it's a few
  lines rendered on an existing printout or PDF. No HL7 interface, no EHR project, no per-vendor
  integration. That low bar is exactly why it can spread.
- **It compounds VitaTrack's core bet.** The whole point of camera capture is to avoid bespoke
  hospital-system integrations. The QR is the same philosophy taken to its logical end: a universal,
  offline, vendor-neutral hand-off that works on paper *and* screens.
- **It's a wedge into partnerships.** "Print our QR and your patients' results import perfectly" is a
  concrete, low-cost ask that gets VitaTrack in the door with clinics and labs — and each adopter
  makes the app visibly better for their patients.

**Why it must not block v1**

- **Adoption is a long game.** Getting providers to change what they print is a
  business-development and standards effort measured in quarters, not sprints. If the product needed
  QR adoption to be useful, it would be dead on arrival.
- **Coverage is partial for years.** Even optimistically, most artifacts a patient photographs next
  year will *not* carry a VitaTrack QR. The OCR path has to be excellent on its own.
- **So the QR is a "gets better over time" layer.** The app decodes it the instant a provider prints
  it; until then, OCR carries the load. The same capture screen handles both — a QR just skips
  straight to a perfect, all-green review.

**Verdict:** high-value, low-marginal-cost, strategically aligned — worth building and worth pitching,
*after* the camera path proves the loop. Pilot with one friendly lab or clinic before investing in
broad standardisation.

---

## Design goals

1. **Exact & trustworthy** — the payload is the data, and a signature proves who issued it.
2. **Offline** — a phone verifies and imports with no network call.
3. **Universal** — one schema covers vitals, labs, prescriptions, and imaging-report metadata.
4. **Compact** — fits in a small QR that prints cleanly at low ink/resolution.
5. **Open & versioned** — published spec, room to evolve, no VitaTrack lock-in (any app could read it).
6. **Safe by default** — an unsigned or unverifiable QR is shown for review, never trusted silently.

---

## Wire format

A single string encoded in the QR:

```
VT1.<base64url(payloadJSON)>.<base64url(signature)>
```

- **`VT1`** — scheme + version tag. Lets readers reject non-VitaTrack codes fast and lets the format evolve.
- **payload** — a compact JSON object (schema below), UTF-8, base64url-encoded.
- **signature** — Ed25519 signature over the exact payload bytes, made with the issuer's private key.
  Readers hold the matching public keys in a small trusted **key directory** and verify offline.

Ed25519 is chosen for small signatures (64 bytes), fast verification on phones, and wide library support.

### Payload schema (`ver: 1`)

```jsonc
{
  "ver": 1,
  "artifact": "device_screen",      // device_screen | lab_report | prescription | document
  "iss": "greenlab-jhb",            // issuer id → must match a key in the trusted directory
  "iat": 1753600000,                // issued-at (unix seconds)
  "exp": 1753686400,                // optional expiry (unix seconds)
  "at":  "2026-07-27T08:00:00Z",    // when the reading was actually taken (ISO 8601)
  "label": "Fasting glucose",       // optional human label (panel/drug/facility)
  "nonce": "a1b2c3",                // optional, binds the QR to one hand-out
  "items": [
    { "k": "glucose", "v": 5.4, "u": "mmol/L", "lo": 4.0, "hi": 5.6, "code": "2345-7" }
  ]
}
```

`items[]` is deliberately generic so one schema serves everything:

| Field | Meaning | Example |
|---|---|---|
| `k` | analyte / vital key | `glucose`, `systolic`, `HbA1c`, `LDL` |
| `v` | value (number or text) | `5.4`, `"Negative"` |
| `u` | unit | `mmol/L`, `mmHg`, `%` |
| `lo` / `hi` | reference range | `4.0` / `5.6` |
| `code` | standard code (LOINC for labs) | `2345-7` |

### Worked examples

**Blood-pressure monitor**
```json
{ "ver":1, "artifact":"device_screen", "iss":"omron-clinic", "iat":1753600000,
  "at":"2026-07-27T08:05:00Z",
  "items":[ {"k":"systolic","v":128,"u":"mmHg"}, {"k":"diastolic","v":82,"u":"mmHg"}, {"k":"pulse","v":70,"u":"bpm"} ] }
```

**Lab panel** (two analytes, with reference ranges + LOINC)
```json
{ "ver":1, "artifact":"lab_report", "iss":"greenlab-jhb", "iat":1753600000,
  "at":"2026-07-26T09:30:00Z", "label":"Lipogram",
  "items":[ {"k":"LDL","v":3.1,"u":"mmol/L","hi":3.0,"code":"18262-6"},
            {"k":"HDL","v":1.4,"u":"mmol/L","lo":1.0,"code":"2085-9"} ] }
```

**Prescription**
```json
{ "ver":1, "artifact":"prescription", "iss":"clicks-pharmacy", "iat":1753600000,
  "label":"Metformin", "items":[ {"k":"drug","v":"Metformin"}, {"k":"strength","v":"500 mg"},
  {"k":"dose","v":"1 tablet"}, {"k":"frequency","v":"twice daily"} ] }
```

---

## Security model

The signature is the whole point — without it, a QR is just a convenient way to inject fake clinical
data. The rules:

1. **Every QR is signed** by the issuer's private key over the exact payload bytes.
2. **The app ships a trusted key directory** (`issuer id → Ed25519 public key`), refreshed from the
   VitaTrack backend. Only known issuers verify.
3. **Verification is offline** and happens before any value is shown as trusted.
4. **Unverifiable ⇒ untrusted, not rejected.** If the signature fails or the issuer is unknown, the
   app still shows the decoded values *but flags them for mandatory review* (never a silent save).
   This is already implemented in the prototype (`handleScannedQr` → `unverified_signature`).
5. **`exp`** lets a provider bound a QR's validity; expired codes are treated as untrusted.
6. **`nonce`** (optional) binds a QR to a single hand-out so a photographed code can't be quietly reused
   across patients if the provider wants that guarantee.
7. **No PII beyond the reading.** The QR carries the measurement, not the patient's identity — it's
   scanned by *that* patient into *their* app, so identity comes from the logged-in session.

### Key management

- Issuers generate an Ed25519 keypair; the **public** key + issuer id are registered with VitaTrack.
- Private keys never leave the issuer. Compromise ⇒ revoke the issuer id in the directory; old QRs stop
  verifying at next directory refresh.
- The directory is small, cacheable, and versioned so the app works offline between refreshes.

---

## Adoption path for providers

Ordered from lowest to highest lift, so a partner can start tiny:

1. **PDF / print add-on (lowest lift).** A lab or clinic whose LIS/EHR already generates a result PDF
   adds a rendered QR in a corner. Often a report-template change — no core system work.
2. **Pharmacy label.** Dispensing software prints the QR on the medicine label or script slip.
3. **Device firmware / companion (highest value).** BP monitors and glucometers show the QR on-screen
   or in their companion app after a reading — the patient scans their own device. Best UX, longest lead.

For each tier VitaTrack provides: the open spec, a small signing library/SDK, a sandbox issuer key, and
a test app to confirm scans import correctly.

## Rollout phases

| Phase | What | Goal |
|---|---|---|
| **0. Publish** | Finalise `VT1` spec + reference signer/verifier (the app already decodes it) | A stable thing to pitch |
| **1. Pilot** | One friendly lab *or* clinic prints the QR on real reports; measure scan success + import accuracy | Prove the loop end-to-end with real patients |
| **2. SDK + directory** | Signing SDK, hosted key directory, issuer onboarding | Make it self-serve for new providers |
| **3. Device makers** | Approach a BP/glucometer vendor for on-device QR | Cover the highest-volume, highest-value case |
| **4. Standardise** | Publish openly; invite other health apps to read `VT1` | Network effect: providers print once, many apps benefit |

Deliberately opening the format to other apps is a feature: a provider is far more likely to print a QR
that the whole ecosystem can read than a VitaTrack-only one, and VitaTrack still wins as the app with
the best capture experience around it.

---

## Bottom line

The QR is worth exploring — it's the natural endgame of the "get data from a picture instead of
integrating with every hospital system" thesis, it's cheap for providers, and it removes OCR's most
dangerous failure mode on the most sensitive data. Build the camera path first so the product stands on
its own; publish `VT1` and run a single-partner pilot in parallel; expand only once the pilot shows real
patients scanning real readings into clean records. The app is already built to decode it — the rest is
partnerships.
```
