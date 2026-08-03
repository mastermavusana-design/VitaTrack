# VitaTrack — project notes for Claude

## Git / deploy workflow (set by SALVATOR_ORBIS, 2026-08-01)
- Commit **everything to `main`** and push. `main` is the Vercel Production branch, so
  pushing to `main` deploys the live site. Do this going forward — don't leave work on
  feature branches unless explicitly asked.
- When finishing a change, commit to `main` and push `origin main`.

## Product principle — web/mobile parity (set by SALVATOR_ORBIS, 2026-08-01)
- **The web app must do everything the mobile app can do.** Treat the mobile app's
  feature set as the baseline; the web companion should reach and stay at parity with it.
- When adding a feature to mobile, add (or plan) the web equivalent too. When reviewing
  gaps, measure the web app against mobile, not the other way around.
- Current known parity gaps (web is missing / partial): app lock (biometric → passkey/PIN),
  offline-first (mobile uses WatermelonDB; web is online-only — needs PWA/offline),
  guided onboarding, a notifications-history screen, a medication detail + dose-history
  view, and signed on-device capture provenance. See `REMEDIATION_PLAN.md` R12.

## Environment note
- The repo is a Windows folder mounted into the Linux sandbox. The mount blocks
  git's removal of its own lock files (`unlink` = "Operation not permitted"), so
  git **write** operations (commit/merge/push) fail from the sandbox and leave stale
  `.git/index.lock` / `.git/HEAD.lock`. Run git write commands in the user's own
  Windows PowerShell instead. Sandbox git is fine for read-only inspection.
