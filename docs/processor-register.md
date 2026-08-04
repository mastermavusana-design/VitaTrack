# VitaTrack — Third-Party Processor Register (POPIA)

_Last updated 2026-08-04. Owner: SALVATOR_ORBIS. Companion to `REMEDIATION_PLAN.md` (R11)._

POPIA treats VitaTrack as the **responsible party** and each third party that processes personal
information on our behalf as an **operator**. For each operator we must: have a written operator
agreement/DPA (s21), ensure appropriate security safeguards, and account for any cross-border
transfer (s72). This register tracks that. **PHI must never be sent to a processor that doesn't need
it** — especially telemetry.

Legend — Status: ✅ done · ⚠️ to confirm · ⬜ not started.

## Operators

| Operator | Purpose | Personal data it sees | Region / transfer | Operator agreement / DPA | PHI minimisation |
|---|---|---|---|---|---|
| **Supabase** (Postgres, Auth, Storage, Data API) | Primary data store + auth for all app data | All PHI (vitals, meds, dose logs, visits, documents, ICE, profiles) | `af-south-1` (Cape Town) — **in-country** | ⚠️ confirm signed DPA on the plan | N/A — this is the system of record, in-region |
| **Vercel** | Web hosting / SSR + (legacy) API routes | Today (flag off): PHI transits the EU serverless routes. After R1 client-direct: app shell + auth only | EU (`lhr1`); no African region | ⚠️ confirm DPA | R1 removes PHI processing from Vercel; until then it's the open item |
| **Resend** | Transactional email — caregiver invites, POPIA data-export links | Email address, recipient name, invite/link content | US | ⚠️ sign DPA; confirm SCCs/adequacy for the SA→US transfer | ⚠️ Confirm **no medical detail** in email bodies (invites/links only — no diagnoses, meds, or readings) |
| **Sentry** | Error / performance monitoring (optional; `SENTRY_DSN`) | Error context: stack traces, route, user id, request metadata | US (unless EU data-residency tier chosen) | ⚠️ sign DPA | ⚠️ Scrub PHI from payloads: no request bodies, no vital/med values, mask the user id if feasible; enable `beforeSend` filtering. Consider Sentry's EU region. |
| **Expo push (exp.host)** | Mobile push delivery (refill/caregiver alerts) | Device push token; notification title/body | US | ⚠️ confirm terms cover operator use | ⚠️ Keep notification bodies low-detail (e.g. "Refill soon" / med name only, per current copy) |

> Web push (browser) is sent via the app's own VAPID keys directly to the browser's push service
> (e.g. FCM/Mozilla/Apple) — those push endpoints are transport, not operators holding a data store,
> but the notification body should stay low-detail for the same reason.

## Action items

- [ ] **Resend** — sign DPA; document the SA→US transfer basis (SCCs / consent); audit email
      templates to confirm no medical detail leaves in the body.
- [ ] **Sentry** — sign DPA; implement `beforeSend`/`beforeSendTransaction` PHI scrubbing (drop
      request bodies, vital/med values); evaluate Sentry EU region; confirm the DSN is only set
      where needed.
- [ ] **Supabase** — confirm the signed DPA and that the project region is pinned to `af-south-1`.
- [ ] **Vercel** — confirm DPA; close via R1 (no PHI processing on Vercel once client-direct is on).
- [ ] **Expo** — confirm operator terms; keep push bodies minimal.
- [ ] Re-review this register whenever a new SDK, analytics, or email/notification path is added.

## Notes on current PHI-minimisation posture

- Error monitoring uses `packages/shared/src/monitoring.ts` (`captureException`) with route tags —
  verify it does **not** attach request bodies or PHI values, and add a scrubber if any path does.
- Reminder/notification copy is intentionally low-detail (medication name + "due"/"refill"), which
  keeps medical specifics out of third-party push transport.
