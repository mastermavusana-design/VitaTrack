# VitaTrack — project notes for Claude

## Git / deploy workflow (updated 2026-08-04 — R8 staging gate)
- **`develop` → Vercel Preview, `main` → Vercel Production.** Do day-to-day work on
  `develop` (or a short-lived feature branch merged into `develop`); this deploys to a
  Preview environment, not to live PHI users.
- **`main` deploys to production and is protected.** Promote to prod only by merging
  `develop` → `main` via a reviewed PR with CI green (type-check, lint, tests, RLS pgTAP,
  build). Never commit straight to `main`.
- GitHub branch protection on `main` (require PR + passing CI) must be enabled in repo
  settings — that's a GitHub-side toggle, not a file in the repo.
- _Superseded (was: "commit everything to `main`"): retired by R8 because every push shipped
  straight to production users holding PHI, with no preview/QA buffer._

## Product principle — web/mobile parity (set by SALVATOR_ORBIS, 2026-08-01)
- **The web app must do everything the mobile app can do.** Treat the mobile app's
  feature set as the baseline; the web companion should reach and stay at parity with it.
- When adding a feature to mobile, add (or plan) the web equivalent too. When reviewing
  gaps, measure the web app against mobile, not the other way around.
- Parity status (see `REMEDIATION_PLAN.md` R12): app lock (PIN + passkey), offline-first
  (installable PWA + service-worker caching + offline write queue), guided onboarding,
  notifications-history screen, medication detail + dose-history view, and signed capture
  provenance (web verifies signed reading-QRs via WebCrypto Ed25519, parity with mobile's
  @noble) are all DONE — R12 is fully closed.
  Deferred with the data-layer rework: local-first reads of never-visited routes offline and
  field-level sync conflict resolution (R5 structural + R1 thin-web-tier).

## Environment note
- The repo is a Windows folder mounted into the Linux sandbox. The mount blocks
  git's removal of its own lock files (`unlink` = "Operation not permitted"), so
  git **write** operations (commit/merge/push) fail from the sandbox and leave stale
  `.git/index.lock` / `.git/HEAD.lock`. Run git write commands in the user's own
  Windows PowerShell instead. Sandbox git is fine for read-only inspection.
