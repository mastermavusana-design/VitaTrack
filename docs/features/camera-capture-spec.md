# VitaTrack — Camera Capture ("Snap a reading") Feature Spec

**Status:** Draft for review
**Author:** Product/Eng
**Date:** 2026-07-27
**Applies to:** `apps/mobile`, `apps/web`, `packages/shared`, `supabase`

---

## 1. Summary

Let a user add health data by pointing their camera at the source instead of typing it.
The user navigates to a section (Vitals, Records, Medications), taps **Add → Scan**, aims at the
artifact for a couple of seconds, and VitaTrack extracts the values, shows them for a **quick
review**, and saves them as structured records.

Supported artifacts (v1):

| Artifact | Example | Where the data lands |
|---|---|---|
| **Device screen** | Glucometer, BP monitor, pulse oximeter, thermometer, scale | `vitals` (existing) |
| **Lab result report** | Printed/PDF pathology (glucose, HbA1c, lipids, U&E…) | `lab_results` (new) |
| **Prescription** | Printed or handwritten script | `medications` + `medication_schedules` (existing) |
| **Other documents** | Imaging/radiology report, receipt, discharge summary | `documents` (existing) + light metadata |

> **Scope guardrail — X-rays.** "Reading an X-ray" in v1 means capturing the **radiologist's
> text report** (findings/impression) and filing it as a document. It does **not** mean interpreting
> the image pixels. Automated image interpretation is a regulated medical-device (SaMD) claim and is
> explicitly **out of scope** — see §9.

**Guiding principle:** every extracted value is a *draft*. Nothing enters the clinical record without
the user confirming it (the user's chosen "always review before save" rule). Speed comes from
pre-filling the form perfectly, not from skipping the human.

---

## 2. Why this matters (product rationale)

The user's insight is correct: if patients can get their data from a photo, VitaTrack does **not**
need to integrate one-by-one with every hospital EHR, lab LIS, or device vendor to be useful. The
camera is a universal, vendor-neutral "integration" that works with paper and screens that already
exist today. Deep system integrations (HL7/FHIR feeds) can come later where they add value, but they
stop being a prerequisite for the core loop.

This also unlocks the **QR upgrade path** (separate memo:
`vitatrack-reading-qr-standard.md`): once the camera pipeline exists, a provider who prints a small
signed QR next to a reading turns a fuzzy OCR guess into a perfect, zero-error import. The camera
ships value now; the QR makes it flawless later. The two share the same capture screen.

---

## 3. Recommended architecture: **Hybrid extraction**

The user delegated the engine choice. Recommendation: **hybrid**, chosen per artifact by privacy
sensitivity, layout complexity, and offline need.

| Path | Runs where | Used for | Why |
|---|---|---|---|
| **A. On-device** | Phone (ML Kit text recognition / VisionCamera OCR) | Device screens (7-seg / LCD digits), and QR fast-path | Digits on a device screen are easy OCR; keeps the most frequent, highest-volume case fully **offline** and **private** (image never leaves the phone). |
| **B. In-region cloud vision-LLM** | Supabase Edge Function in `af-south-1` calling a vision model | Lab reports, prescriptions (esp. handwritten), multi-field documents | These have variable layouts and handwriting that on-device OCR handles poorly. A vision-LLM extracts *structured* fields, not just raw text. |
| **QR fast-path** | Phone (offline) | Any artifact carrying a VitaTrack QR | Decodes + verifies signature locally; no OCR, no cloud, 100% accurate. Always tried first. |

### 3.1 Why not "cloud-only" or "on-device-only"

- **Cloud-only** is simplest and most accurate, but it means *every* glucose photo leaves the device —
  a heavier POPIA consent burden and a worse offline story for the single most common action.
- **On-device-only** is the best privacy story but realistically cannot parse a messy lab report or
  handwritten script well enough to hit the "just works" bar. It would make the marquee cases feel broken.
- **Hybrid** gives the private/offline win where volume is highest (device screens) and reserves the
  cloud for the cases that genuinely need it, gated behind an explicit per-scan opt-in.

### 3.2 POPIA / data-residency requirements (non-negotiable)

VitaTrack is POPIA-first and hosted in `af-south-1`. The cloud path must respect that:

1. **Residency.** The vision model must be reachable via an **`af-south-1`-resident** endpoint
   (regional model deployment, or a regional proxy). If the only available model is out-of-region,
   it must be flagged in consent as a cross-border transfer and gated behind explicit opt-in —
   **preferred: keep it in-region.** This is the one open procurement decision (see §11) and is
   isolated behind a single provider interface so it can be swapped without touching app code.
2. **Data minimisation.** Cloud path sends the **image only**, returns structured fields, and the
   raw image is **not persisted** server-side (processed in memory, discarded). Only the extracted
   values + a low-res thumbnail (optional, user-controlled) are stored, under existing RLS.
3. **Consent & transparency.** First cloud scan shows a one-time explainer: "This photo is sent to
   VitaTrack's in-region processor to read the values, then discarded." Recorded in `audit_logs`.
4. **Provenance.** Every saved record from a scan is tagged `source='scan'` (vs `manual`) with a
   pointer to a `scan_captures` audit row, so a clinician/caregiver can see what was machine-read.

---

## 4. User experience

### 4.1 The core loop

```
Section (Vitals/Records/Meds)
   └─ Add ▾
        └─ Scan  ──►  Camera screen (live)
                         │  auto-detects QR → instant import (skip to Review, all green)
                         │  else: user taps shutter (or auto-captures on stable focus)
                         ▼
                     Extract (on-device or cloud, per artifact)
                         ▼
                     Review screen  ──►  fields pre-filled + confidence-coded
                         │  edit anything, then Save
                         ▼
                     Saved to structured record (source='scan')
```

### 4.2 Review screen — confidence coding

Even though the rule is **always review before save**, confidence coding tells the user *where to
look* so review takes two seconds, not twenty:

- 🟢 **High** — value + units parsed cleanly and pass range validation. Pre-filled, normal styling.
- 🟡 **Medium** — parsed but ambiguous (e.g. unit unclear, glare, out-of-usual-range). Highlighted;
  user glances and confirms.
- 🔴 **Low / missing** — couldn't read confidently. Field left blank/red; user types or re-scans.

Nothing is written until the user taps **Save**. Range checks reuse the existing
`VITAL_RANGES` / `validateBloodPressure` etc. from `packages/shared` — a "reading" of systolic 999
is auto-demoted to 🔴 rather than saved.

### 4.3 Entry points

- **Vitals → Add → Scan** (default artifact: device screen)
- **Records → Add → Scan** (default: lab report / document)
- **Medications → Add → Scan** (default: prescription)

All three route into **one** capture screen (`vitals/scan.tsx` in the prototype, later promoted to a
shared `components/capture/`), parameterised by `artifact` type.

---

## 5. Data model changes

### 5.1 New: `lab_results`

`vitals` is intentionally a fixed set of self-measured types (BP, glucose, weight, temp, SpO2, HR).
Lab reports carry analytes that don't fit (HbA1c, LDL, creatinine, eGFR, TSH…). Add a flexible table:

```sql
CREATE TABLE lab_results (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_id   UUID REFERENCES documents(id) ON DELETE SET NULL, -- source report, if filed
  panel         TEXT,                    -- e.g. 'HbA1c', 'Lipids', 'U&E'
  analyte       TEXT NOT NULL,           -- e.g. 'HbA1c', 'LDL cholesterol'
  loinc_code    TEXT,                    -- optional standard code (future QR/FHIR)
  value_num     NUMERIC,
  value_text    TEXT,                    -- for non-numeric results ('Negative')
  unit          TEXT,
  ref_low       NUMERIC,
  ref_high      NUMERIC,
  abnormal_flag TEXT CHECK (abnormal_flag IN ('low','high','critical_low','critical_high','normal','abnormal')),
  specimen_at   TIMESTAMPTZ,             -- collection datetime if printed
  lab_name      TEXT,
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scan','qr','import')),
  capture_id    UUID REFERENCES scan_captures(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.2 New: `scan_captures` (provenance / audit)

One row per scan attempt — the audit trail behind every machine-read value.

```sql
CREATE TABLE scan_captures (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artifact      TEXT NOT NULL CHECK (artifact IN ('device_screen','lab_report','prescription','document','qr')),
  method        TEXT NOT NULL CHECK (method IN ('on_device','cloud','qr')),
  engine        TEXT,                    -- model/provider id + version, for reproducibility
  thumb_path    TEXT,                    -- optional low-res thumbnail in private storage
  raw_extract   JSONB,                   -- structured extraction result (fields + confidences)
  overall_conf  NUMERIC,                 -- 0..1
  status        TEXT NOT NULL DEFAULT 'reviewed' CHECK (status IN ('reviewed','discarded','failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.3 Add `source` provenance to existing tables

Add a `source TEXT DEFAULT 'manual'` and nullable `capture_id UUID` to `vitals` (and reference it from
`documents`), so a scanned vs typed value is distinguishable everywhere. Backfills to `'manual'`.

RLS mirrors the existing pattern exactly: `own CRUD` + `family read` via `is_family_member(profile_id)`.

---

## 6. The extraction contract

One stable JSON shape flows out of **every** path (on-device, cloud, QR) so the UI is engine-agnostic.
Defined in `packages/shared/src/capture/types.ts`:

```ts
type FieldConfidence = 'high' | 'medium' | 'low'

type ExtractedField<T> = { value: T | null; confidence: FieldConfidence; raw?: string }

type ExtractionResult = {
  artifact: 'device_screen' | 'lab_report' | 'prescription' | 'document' | 'qr'
  method: 'on_device' | 'cloud' | 'qr'
  recordedAt?: ExtractedField<string>          // ISO; from a printed timestamp if present
  vitals?: {                                    // device_screen path
    type: VitalType
    systolic?: ExtractedField<number>
    diastolic?: ExtractedField<number>
    pulse?: ExtractedField<number>
    glucose?: ExtractedField<number>
    glucoseUnit?: ExtractedField<'mmol/L'|'mg/dL'>
    // …weight/temp/spo2/hr
  }
  labs?: Array<{ analyte: ExtractedField<string>; value: ExtractedField<number|string>;
                 unit?: ExtractedField<string>; refLow?: ...; refHigh?: ... }>
  medication?: { name: ExtractedField<string>; strength: ExtractedField<string>;
                 dose: ExtractedField<string>; frequency: ExtractedField<string> }
  document?: { category: ExtractedField<string>; provider: ExtractedField<string>;
               date: ExtractedField<string>; title: ExtractedField<string> }
  warnings: string[]                            // e.g. 'glare_detected', 'unit_ambiguous'
}
```

The server function and the on-device parser both emit this. The review screen only ever renders
`ExtractionResult`.

---

## 7. Backend: `extract-reading` Edge Function

- **Location:** `supabase/functions/extract-reading/`
- **Auth:** Supabase JWT (user context) — same as other functions.
- **Input:** `{ artifact, imageBase64, mimeType }`.
- **Behaviour:**
  1. Verify user, rate-limit per profile.
  2. Build an artifact-specific **structured-extraction prompt** (strict JSON schema, no free text).
  3. Call the vision model **via a single `VisionProvider` interface** (so the model/vendor is one
     swap, not scattered). The provider is expected to be an **`af-south-1`-resident** deployment.
  4. Post-process: coerce units, run `packages/shared` range validation to assign confidences,
     never invent values (missing → `null`/low).
  5. **Do not persist the raw image.** Optionally store a caller-provided low-res thumbnail.
  6. Return `ExtractionResult`; write a `scan_captures` row.
- **Prompting rule:** the model returns *only* what it can see, each field with a confidence; it is
  instructed never to guess a plausible number. Hallucinated vitals are the top clinical risk (§9).

The function is provider-agnostic behind the `VisionProvider` seam. A **real Bedrock provider is now
wired** (`makeBedrockProvider`): it calls a Claude vision model on Amazon Bedrock using an **in-region
inference profile** (`BEDROCK_MODEL_ID`) so images are processed only in `af-south-1`, and reads
credentials from dedicated `BEDROCK_*` env vars. When those aren't set it falls back to the
deterministic mock, so the flow still runs in dev. Model output is JSON-extracted (tolerant of prose /
```json fences) into the `ExtractionResult` shape. Configure the env vars on the `extract-reading`
function only — see `.env.example`.

---

## 8. Rollout plan (phased)

**Phase 0 — Foundation (this prototype).**
Migration (`scan_captures`, `lab_results`, `qr_issuer_keys`, provenance columns), shared extraction +
QR types & validators, `extract-reading` function skeleton with mock provider, mobile `scan.tsx`
capture+review flow wired to `addVital`, QR fast-path decoder.

**Native build note.** Phase 1 adds native deps — `@react-native-ml-kit/text-recognition` (on-device
OCR) and `@noble/ed25519` + `@noble/hashes` (QR signatures). ML Kit is a native module, so it needs a
**dev/prebuild client** (not Expo Go): `pnpm install` then `npx expo prebuild` + an EAS dev build.
The noble libraries are pure JS and run in Hermes as-is.

**Phase 1 — Device screens, on-device.** ✅ *implemented*
Glucometer/BP/oximeter/thermometer/scale path runs fully on-device + offline: ML Kit text
recognition in the app (`useCapture.extractOnDevice`) feeds the pure, unit-tested parser
`parseDeviceScreenText` (`packages/shared/src/capture/deviceScreen.ts`), gated by `gateVitals`.
Highest volume, best privacy, no vendor dependency. Also implemented: **signed-QR verification** —
Ed25519 via `@noble/ed25519` in the app, a shared verifier (`ed25519.ts`) over a trusted key
directory (`qr_issuer_keys`), so a signed QR imports offline and an unverifiable one is flagged for
mandatory review, never trusted silently.

**Phase 2 — Cloud vision for lab reports + prescriptions.**
Wire the real in-region `VisionProvider`, consent flow, `lab_results` UI in Records, prescription →
medication draft flow. Opt-in per scan.

**Phase 3 — Documents & imaging reports.**
Radiology/discharge/receipt capture → `documents` with extracted metadata (date, provider, category)
and the report text; no image interpretation.

**Phase 4 — QR standard.**
Publish the signed QR schema (memo), pilot with 1–2 friendly clinics/labs. Camera already decodes it;
this is a provider-side + verification-key rollout. See the QR memo.

---

## 9. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Model hallucinates a plausible-but-wrong value** | High (clinical) | Always-review-before-save; confidence coding; range validation demotes implausible values; model instructed to return `null` not guesses; provenance `source='scan'`. |
| **Misread digit enters record silently** | High | No silent saves — the user's chosen rule. Every field is shown before write. |
| **X-ray "interpretation" perceived as diagnosis** | High (regulatory) | v1 reads the *report text* only; explicit copy "VitaTrack does not interpret images"; no findings generated by the app. |
| **PHI leaves region / weak consent** | High (POPIA) | In-region processing; image not persisted; one-time consent; audit log; on-device path for the common case. |
| **Handwriting unreadable** | Medium | Confidence 🔴 → user edits; never a blind save; suggest re-scan with better light. |
| **Wrong profile (caregiver scanning for a dependent)** | Medium | Active profile shown on capture + review header; confirm-profile on save. |
| **Unit confusion (mmol/L vs mg/dL)** | Medium | Unit is its own extracted field with confidence; SA default mmol/L; range check catches a mg/dL value entered as mmol/L. |

---

## 10. Testing

- **Unit (`packages/shared`)** — extraction-result validators, unit coercion, confidence assignment,
  QR parse + signature verify (valid, tampered, expired, wrong-key). Runs in existing Vitest setup.
- **Golden images** — a fixture set of device screens / lab reports / scripts with expected
  `ExtractionResult`; regression-tested against the mock and (later) the real provider.
- **E2E (mobile)** — capture → review → save writes the right structured row with `source='scan'`
  and a `scan_captures` audit row.
- **Adversarial** — glare, blur, partial crops, look-alike numbers (0/O, 5/S, 1/7) must degrade to
  🟡/🔴, never to a confident wrong value.

---

## 11. Decisions (recommended — confirm before Phase 2)

**1. Vision provider → Amazon Bedrock in `af-south-1`, Claude vision model, via an in-region
inference profile.**
Bedrock is available in the Cape Town region with Claude 4.5-class vision models. Use the
**in-region inference profile** (not the global cross-Region profile): processing stays entirely
within `af-south-1` with no cross-region hop, which is what POPIA residency needs. It also keeps
VitaTrack on one cloud footprint (Supabase already runs on AWS in-region). Kept behind the
`VisionProvider` seam, so the model can be swapped without app changes.
- *Capacity trade-off:* an in-region profile has less throughput headroom than the global one.
  Mitigate with retry/back-off and the on-device fallback — **do not** silently fall back to the
  global (cross-region) profile; if capacity ever forces it, gate that behind explicit per-scan
  consent as a cross-border transfer.

**2. Thumbnail retention → store an optional, low-res, encrypted thumbnail; never the full image.**
Default **ON**, user-toggleable globally and deletable per capture. Rationale: for health data, being
able to see the *source* behind a machine-read value is genuinely valuable — it lets the user (or a
caregiver/clinician) audit and dispute a reading, and it strengthens the `source='scan'` provenance
trail. A low-res thumbnail is minimal data; the **full-resolution image is never persisted
server-side** (processed in memory in `extract-reading`, then discarded). Store thumbnails in a
private, RLS-scoped, in-region Supabase Storage bucket; never used for model training.

**3. Auto-capture → hybrid, by artifact.**
- **QR:** auto-imports the instant it's in frame (already implemented).
- **Device screens:** **auto-capture on stable focus** with a manual shutter fallback — this is the
  "aim for a couple of seconds and it's done" magic for the highest-volume case.
- **Lab reports / prescriptions / documents:** **tap-to-capture** — framing the whole page matters,
  so let the user compose the shot.

**4. Prescription depth → middle tier: structured draft + catalog match, always user-confirmed.**
Extract name/strength/dose/frequency, fuzzy-match the drug against the existing `medications` catalog,
and pre-fill a *suggested* schedule — but everything lands as a **draft the user confirms**. Never
auto-create an active medication or a live schedule from a scan. Handwriting error rates plus the
clinical stakes of a wrong dose make silent commit unacceptable; the review step is mandatory here.
```
