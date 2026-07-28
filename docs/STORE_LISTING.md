# VitaTrack — App Store Listing Metadata

Copy-ready listing content for **Apple App Store Connect** and **Google Play Console**.
Fill in `[bracketed]` items before submission.

---

## Shared basics

| Field | Value |
|---|---|
| App name | VitaTrack |
| Bundle ID (iOS) | `app.vitatrack.mobile` |
| Package (Android) | `app.vitatrack.mobile` |
| Version | 1.0.0 (build 1) |
| Primary category | Medical |
| Secondary category | Health & Fitness |
| Default language | English (South Africa) |
| Support URL | https://vitatrack.vercel.app |
| Marketing URL | https://vitatrack.vercel.app |
| Privacy Policy URL | https://vitatrack.vercel.app/privacy |
| Terms URL | https://vitatrack.vercel.app/terms |
| Support email | support@vitatrack.co.za |
| Price | Free |

> If you attach a custom domain in Vercel, update every URL above and
> `WEB_BASE_URL` in `packages/shared/src/constants/index.ts`.

---

## Apple App Store

**Subtitle (30 chars max)**
> Meds, vitals & emergency info

**Promotional text (170 chars)**
> Never miss a dose. Track medications, log vitals, store health documents, share with caregivers, and keep an emergency profile ready — built for South Africa.

**Description**
> VitaTrack is your personal health companion. Stay on top of your medications, keep a clear history of your vital signs, and make sure the people who care about you can help when it matters.
>
> MEDICATIONS & REMINDERS
> • Add medications with schedules, strengths, and pill counts
> • Get reminders so you never miss a dose
> • Track adherence and build streaks
> • Refill warnings before you run out
>
> VITALS TRACKING
> • Log blood pressure, glucose, weight, temperature, SpO₂, and heart rate
> • See colour-coded readings based on recognised guidelines
> • Review trends over time
>
> HEALTH RECORDS
> • Store prescriptions, lab results, and other documents securely
> • Keep a record of doctor visits
>
> CAREGIVER SHARING
> • Invite family or caregivers with view-only or dose-logging access
> • Caregivers get alerts if a dose is missed
>
> EMERGENCY (ICE) PROFILE
> • Publish a QR-linked emergency profile with blood type, allergies, conditions, and contacts
> • Help first responders help you
>
> PRIVACY FIRST
> • Your health data is hosted in the UK/EU under POPIA-compliant safeguards
> • Row-level security, encryption, and a biometric app lock
> • Export or delete your data at any time
>
> VitaTrack is a record-keeping and reminder tool, not a medical device, and does not provide medical advice. Always consult a healthcare professional.

**Keywords (100 chars, comma-separated)**
> medication,reminder,pill,vitals,blood pressure,glucose,health,POPIA,caregiver,emergency,ICE,tracker

**What's New (v1.0.0)**
> First release of VitaTrack. Medication reminders, vitals tracking, health records, caregiver sharing, and emergency profiles.

**Age rating:** 17+ (Medical/Treatment Information) — confirm in the App Store questionnaire.

### App Privacy (nutrition labels)
Data collected and **linked to the user**:

- Contact Info: name, email, phone
- Health & Fitness: health data (medications, vitals, conditions)
- User Content: documents, other user content
- Identifiers: user ID
- Diagnostics: crash data (only if a Sentry DSN is configured)

For every type: **Used for App Functionality only. Not used for tracking. Not used for advertising.**
Data is **not** shared with data brokers. Users can request deletion (in-app account deletion + data export).

---

## Google Play

**Short description (80 chars)**
> Medication reminders, vitals tracking, and emergency health profiles.

**Full description** — reuse the Apple description above (Play allows up to 4000 chars).

**Content rating:** complete the IARC questionnaire — expected **Everyone / PEGI 3**, references to medical content. No violence, no user-to-user unmoderated content beyond private caregiver sharing.

### Data safety form answers

| Question | Answer |
|---|---|
| Does your app collect or share user data? | Yes, collects |
| Is data encrypted in transit? | Yes |
| Can users request deletion? | Yes (in-app account deletion) |
| Data types — Personal info | Name, email, phone, user IDs |
| Data types — Health & fitness | Health info |
| Data types — Files & docs | User documents |
| Data types — App activity / diagnostics | Crash logs (if Sentry DSN set) |
| Purpose (all types) | App functionality |
| Shared with third parties? | No (Operators process on our behalf; not sold/shared for their own use) |
| Used for advertising? | No |

---

## Screenshots & assets checklist

- [ ] iPhone 6.7" and 6.5" screenshots (required)
- [ ] iPad screenshots — **N/A** (`supportsTablet: false`)
- [ ] Android phone screenshots (min 2), 7"/10" tablet optional
- [ ] Feature graphic (Play, 1024×500)
- [ ] App icon 1024×1024 (from `assets/images/icon.png`)
- [ ] Short demo video (optional)
