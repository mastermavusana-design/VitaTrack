# VitaTrack — Google Play Store Listing (draft)

Fill these into **Play Console → Grow → Store presence → Main store listing**.
Character limits are enforced by Google and shown in brackets.

## App name  [max 30]
```
VitaTrack: Meds & Health
```
(Plain alternative: `VitaTrack`)

## Short description  [max 80]
```
Track medications, get dose reminders, and keep your health records in one place.
```

## Full description  [max 4000]
```
VitaTrack helps you stay on top of your medications and your health — without the paperwork.

WHAT YOU CAN DO
• Track every medication, dose, and schedule in one clear list.
• Get reminders when it's time to take a dose, so nothing slips.
• Keep a history of what you've taken and when.
• Store and organise health documents — snap a photo and VitaTrack reads the text for you.
• Scan verified health QR codes to capture readings you can trust.
• Keep an emergency (ICE) profile that's reachable when it matters.

BUILT FOR PRIVACY
• Lock the app behind a PIN or your fingerprint / face.
• Your health data is encrypted in transit.
• You stay in control — export or delete your data whenever you want.

WORKS THE WAY YOU DO
• Fast, offline-friendly, and designed to be simple.
• Reminders work even without a network connection.

VitaTrack is a personal health organiser. It does not provide medical advice, diagnosis, or treatment. Always follow the guidance of your doctor or pharmacist.
```

## Category & tags
- **App category:** Health & Fitness  *(alternative: Medical — heavier review; only pick it if you position VitaTrack as a medical tool)*
- **Tags:** medication reminder, health tracker, pill reminder

## Contact details  (required)
- **Email:** _support@vitatrack.app_ (or an inbox you monitor) — **required, shown publicly**
- **Website:** https://vita-track-life.vercel.app
- **Phone:** optional

## Privacy policy URL  (required — app handles health data)
- **Already live in the web app** at **https://vita-track-life.vercel.app/privacy** (a full POPIA policy, source: `apps/web/src/app/privacy/page.tsx`). Paste that URL here.
- Before submission, fill the bracketed placeholders in that page (operator name, address, contact phone/email). The generic `store/PRIVACY_POLICY.md` is superseded by this page — use the live URL.

## Graphic assets
| Asset | Play requirement | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | ✅ `store/assets/play-icon-512.png` (generated) |
| Feature graphic | 1024×500 PNG/JPG | ✅ `store/assets/feature-graphic-1024x500.png` (generated) — swap for a designed one later if you like |
| Phone screenshots | 2–8 images, PNG/JPG, 16:9 or 9:16, each side 320–3840px | ⛔ **You must supply these from the running app** |
| Tablet screenshots | optional | — |

### Screenshots to capture (recommended set of 5–6)
Run the app on a phone/emulator and capture:
1. Today's doses / home screen with a reminder visible
2. Medication list
3. Medication detail + dose history
4. Add / scan a medication
5. Health document capture (OCR)
6. App-lock (PIN / biometric) screen

Tip: capture at a clean device resolution (e.g. 1080×1920). You can add a plain caption band, but the screenshot must show the real app.
