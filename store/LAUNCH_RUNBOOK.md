# VitaTrack → Google Play: Launch Runbook

Everything below runs on **your** machine (Windows PowerShell) under **your** accounts. Commands are one-per-line because PowerShell 5.1 doesn't support `&&` chaining.

**Realistic timeline (new personal account):** register + ID verification (a few days) → build (same day) → **closed test with ≥12 testers for 14 continuous days** → apply for production → review (≤7 days). Budget ~3 weeks. An **organization** account skips the 12-tester gate but needs D-U-N-S/business verification.

---

## Phase 0 — Prerequisites (one time)
1. Node 18+ installed (`node -v`).
2. Install the EAS CLI globally:
   ```powershell
   npm install -g eas-cli
   ```
3. Create a free **Expo** account at https://expo.dev (this runs your cloud builds).
4. Create your **Google Play Console** developer account ($25 one-time) at https://play.google.com/console — complete identity verification. This is the step that gates everything; start it first.

---

## Phase 1 — Build the release AAB (Expo/EAS)
From the mobile app folder:
```powershell
cd C:\Dev\vitatrack\apps\mobile
eas login
eas build --platform android --profile production
```
Notes:
- On first build, EAS offers to **generate an Android keystore** — accept it. EAS manages this as your **upload key** (keep it; losing it complicates updates).
- `appVersionSource` is `remote` and the production profile has `autoIncrement: true`, so EAS assigns and bumps `versionCode` for you.
- The production profile builds an **app-bundle (.aab)** — exactly what Play needs.
- When it finishes, download the `.aab` from the build page (the CLI prints the URL).

Optional smoke test before the store: build an installable APK and sideload it:
```powershell
eas build --platform android --profile preview
```

---

## Phase 2 — Create the app in Play Console
1. Play Console → **Create app**. Name **VitaTrack**, app (not game), free, accept declarations.
2. Leave **Play App Signing** enabled (default). Your EAS keystore becomes the upload key; Google holds the app signing key.
3. Complete **App content** (left nav) — use the drafts in this folder:
   - Privacy policy URL (host `PRIVACY_POLICY.md`)
   - Data safety (`DATA_SAFETY.md`)
   - Content rating (IARC → Everyone)
   - Target audience (adults)
   - **Health apps declaration** (VitaTrack stores health data)
   - Ads: No
   - App access: add demo login credentials for reviewers
4. Complete **Main store listing** (`STORE_LISTING.md`) + upload `store/assets/play-icon-512.png`, `store/assets/feature-graphic-1024x500.png`, and your phone screenshots.

---

## Phase 3 — First upload → Closed testing
The 12-tester requirement is satisfied on a **Closed testing** track (internal testing does *not* count).

**Option A — manual upload (simplest for the first one):**
1. Play Console → **Testing → Closed testing → Create track**.
2. Upload the `.aab` you downloaded from EAS.
3. Add testers: create an email list (or a Google Group) with **at least 12 people**. Real, separate Google accounts.
4. Share the opt-in link; each tester must **accept and install**.
5. Roll out the release to the closed track.

**Option B — `eas submit` (automate later):** requires a Google Cloud **service account** JSON with Play access:
- Google Cloud Console → create service account → create JSON key.
- Play Console → **Users & permissions** → invite that service account, grant release permissions.
- Save the JSON as `apps/mobile/google-services-key.json` (already referenced in `eas.json`; it's git-ignored — never commit it).
- Then:
  ```powershell
  cd C:\Dev\vitatrack\apps\mobile
  eas submit --platform android --profile production
  ```
  The submit `track` in `eas.json` is `internal`; change it (or pass `--track`) to your **closed** track for the 14-day requirement.

---

## Phase 4 — The 14-day clock
- Keep **≥12 testers opted in for 14 continuous days**. If someone drops out and you fall below 12, the clock can reset — over-recruit (15+).
- Push a couple of updates during the period and gather feedback; Google's reviewers like to see genuine testing.

---

## Phase 5 — Apply for production
1. After 14 continuous days, Play Console **Dashboard** shows the production-access application.
2. Fill the three sections (about the app, testing done, production readiness).
3. Submit. Review is usually **≤7 days**.
4. Once granted: **Production → Create release**, promote the tested build, set rollout %, and publish.

---

## Updating later
```powershell
cd C:\Dev\vitatrack\apps\mobile
eas build --platform android --profile production
eas submit --platform android --profile production
```
Bump the human-facing `version` in `app.config.js` for meaningful releases; EAS handles `versionCode`.

---

## Repo / git note
These `store/` docs are safe to commit. Per this repo's environment, **git write operations fail from the sandbox** (mounted Windows folder locks) — commit from your own PowerShell:
```powershell
cd C:\Dev\vitatrack
git add store/
git commit -m "Add Play Store launch package for VitaTrack"
```
Do **not** commit `google-services-key.json` or any keystore (the hardened `apps/mobile/.gitignore` now blocks these).

Housekeeping: `apps/mobile/.env` is already tracked in git. It contains only public `EXPO_PUBLIC_*` values (low risk), but to stop tracking it going forward:
```powershell
cd C:\Dev\vitatrack
git rm --cached apps/mobile/.env
git commit -m "Stop tracking mobile .env (values are public but shouldn't be in git)"
```

---

## Quick gap checklist
- [x] Expo app + EAS production profile (builds AAB) — ready
- [x] App icon 512×512, feature graphic 1024×500 — generated in `store/assets/`
- [x] Store listing / privacy / data safety drafts — in `store/`
- [ ] Play Console account created + ID verified — **you**
- [ ] Phone screenshots from the running app — **you**
- [ ] Privacy policy hosted at a public URL — **you**
- [ ] Demo login for reviewers — **you**
- [ ] 12+ testers recruited — **you**
- [ ] (Optional) FCM: add `google-services.json` for remote push; local dose reminders work without it
