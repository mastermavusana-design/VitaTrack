# R1 — Client-Direct + RLS Migration Design

_Prepared 2026-08-03. Companion to `REMEDIATION_PLAN.md` (R1). This is the implementation
design for moving PHI processing into `af-south-1`; it is meant to be executed and **runtime-
tested** on a machine that can run the app, not blind-shipped._

---

## 1. Goal and the constraint that shapes it

**Goal:** no route that reads or writes PHI executes outside `af-south-1`.

**Constraint (verified 2026-08-03):** Supabase **Edge Functions have no `af-south-1` region** —
invocation regions are AP / NA / EU / SA (São Paulo) only, defaulting to the region nearest the
caller. So moving compute to Edge Functions would still process PHI in the EU. What *does* run in
the project region are Postgres, Auth, Storage, and the **Data API (PostgREST)**. Therefore the
residency-correct design is: **the browser calls the af-south-1 Data API directly under RLS**, and
only a small set of secret-requiring operations remain as Edge Functions (documented).

## 2. RLS audit — PASSED (prerequisite)

Client-direct is only safe if RLS fully encodes the authorization the `/api` routes enforce. It
does, with **no new policies required**:

- **Own writes** — every core table has `FOR ALL USING (profile_id = auth.uid())`, which also
  gates INSERT/UPDATE (WITH CHECK). A user can only write their own rows.
- **Caregiver reads** — `… family read USING (is_family_member(profile_id))` (SECURITY DEFINER
  helper over `family_members` where `invitee_id = auth.uid() AND status = 'accepted'`).
- **Caregiver writes** — the only on-behalf write in the API is dose logging, matched by
  `dose_logs: dose_logger ins WITH CHECK (is_dose_logger(profile_id))`. Every other `/api` write
  inserts as the caller's own `profile_id`.
- **Owner resolution** — a caregiver reads their own `family_members` row (`family: invitee read`)
  to find `owner_id`, then reads the owner's data under family-read. No server hop needed.
- **ICE public page** — already hardened (`get_public_ice_profile` RPC; anon has no base-table
  SELECT). No action.

## 3. The hard part: offline architecture must move down a layer

The R12 offline PWA works by having the **service worker intercept same-origin `/api/*`** —
caching GETs and queuing failed writes. Direct Supabase calls are **cross-origin**
(`https://<ref>.supabase.co`), which the SW deliberately ignores. So going client-direct **breaks
both offline reads and offline writes** unless offline moves to the data-client layer:

- **Read cache** — an IndexedDB store of last-seen rows per table, populated on every successful
  read; served when a read fails offline. (This is the deferred "local-first reads" work.)
- **Write queue** — an IndexedDB queue of pending mutations `{table, op, row, ts}`; on a failed/
  offline mutation, enqueue and return an optimistic result; replay on `online` and on load.
  Conflict rule: last-write-wins keyed on `updated_at` (consistent with R5); deletes tombstone.
- The SW keeps doing **static-asset + navigation** caching (still same-origin) and **push**; it
  stops being the write/API queue as routes migrate off `/api`.

This is why R1 pulls in the R5-structural / R12-deferred data-layer work — it is a real
mini-project, not a set of route flips.

## 4. Route-by-route migration map

| `/api` route | Disposition | Notes |
|---|---|---|
| `vitals` (GET/POST) | → client-direct | own-write; validate with `@vitatrack/shared` validators + DB CHECK |
| `medications` (GET/POST) + `[id]` (PATCH/DELETE) | → client-direct | own-CRUD; `[id]` ownership already matches `own CRUD` |
| `dose-logs` (GET/POST) | → client-direct | caregiver path uses `dose_logger ins`; set `logged_by = auth.uid()` |
| `doctor-visits` (GET/POST) | → client-direct | own-CRUD |
| `documents` (GET/POST) | → client-direct | storage RLS enforces `userId/` path prefix |
| `scan-captures` (POST) | → client-direct | own-CRUD |
| `ice` (GET/PUT) | → client-direct | own-CRUD (public read already via RPC) |
| `profile` (GET/PUT) | → client-direct | `profiles own read/update` |
| `push/subscribe`, `push/unsubscribe` | → client-direct | `push_tokens own CRUD` |
| `cron/reminders` (web-push send) | **stays Edge** (R4) | needs VAPID private key; move to Edge + pg_cron, drop Vercel cron |
| `data-export`, `send-family-invite` | **stays Edge** | Resend secret / service-role; already Edge Functions |

**Validation:** the numeric-range / enum checks currently in the routes move to the client using
the existing `@vitatrack/shared` validators; DB CHECK constraints + RLS remain the integrity
backstop, so a bypassed client cannot write bad or cross-tenant data.

## 5. Reads (SSR → client)

Dashboard pages currently render server-side on Vercel (EU) — so reads leak too. Move data
fetching into client components using the browser Supabase client + the read cache from §3. This
is the largest chunk and should follow the write path once the data layer exists. Auth-gating and
the shell can stay server-rendered (no PHI in the shell).

## 6. Sequencing (each step independently shippable + tested)

1. **Data layer module** — `lib/dataStore.ts`: typed read-through cache + write queue over the
   browser Supabase client; `online` replay; pending-count events (reuse the R12 indicator).
2. **Writes-first pilot** — migrate the `vitals` create path onto it; verify offline enqueue +
   replay + RLS behaviour end-to-end.
3. **Replicate writes** — meds, dose-logs, visits, documents, scan-captures, ice, profile, push.
4. **Reads** — move SSR dashboard reads to client-direct + read cache.
5. **Retire `/api`** — delete migrated routes; trim the SW to static/nav/push only.
6. **R4** — reminders → Edge Function + `pg_cron`; delete the Vercel cron; set `vercel.json`
   regions honestly (web is now shell-only).
7. **README** — describe the real data flow.

## 7. Test plan (runtime — required before ship)

- Offline: create a vital offline → queued → reconnect → row appears; kill app mid-queue → replay
  on next load; no duplicate on double-replay (idempotency key).
- RLS: a second user cannot read/write the first user's rows (cross-tenant deny).
- Caregiver: a `dose_logger` can insert a dose for the owner; a `viewer` cannot; neither can edit
  meds/vitals.
- Reads: dashboard renders from cache offline; refreshes when back online.
- ICE public page still returns only the RPC subset.

## 8. Interim honesty (now)

Until the above lands, the README should not claim the whole app runs in `af-south-1`. Storage,
DB, Auth, and the Data API do; the Next.js web tier currently runs on Vercel (EU). See the README
"Data residency" note.
