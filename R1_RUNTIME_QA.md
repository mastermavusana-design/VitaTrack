# R1 Client-Direct — Runtime QA Script

_Concrete, click-by-click verification of the `NEXT_PUBLIC_CLIENT_DIRECT` path before enabling it
anywhere shared. Companion to `R1_BUILD_PLAN.md` §6/§7. Budget ~45–60 min._

**Goal of this pass:** prove that with the flag on, every PHI read and write goes **directly to the
`af-south-1` Supabase Data API** (not to the Vercel `/api/*` origin), that the offline queue/replay
and read-cache behave, that RLS blocks cross-tenant access, and that caregiver roles are enforced.

Automated logic tests (queue/replay/idempotency/cache) already pass via
`pnpm --filter @vitatrack/web test`. Parts **1–3** (routing + reads + writes, now also asserting each
write is accepted with a 2xx) and Part **6** (RLS) are additionally automated — see
`docs/qa-automation.md` (Playwright E2E + `scripts/rls-check.mjs`). This manual script still covers
what those can't: real offline toggle + IndexedDB (Part 4/5), camera scan (Part 8), the sign-out
purge check (Part 9), and caregiver-role UI (Part 7).

---

## 0. Setup

### 0.1 Accounts
You need **two** accounts on the same hosted Supabase project. The fastest way to create both is
`node scripts/qa-seed-accounts.mjs` (see `docs/qa-automation.md`), which also writes their creds into
`apps/web/.env.local` for the automated harnesses. To set them up by hand instead:

- **User A** — the owner. Seed some data (a couple of vitals, 1–2 meds, a visit) either before the
  run or during Part 2.
- **User B** — a second, unrelated user (for the RLS cross-tenant test in Part 6).
- Optional: accept a **caregiver invite** from A to B for Part 7 (Settings → Family Sharing → invite
  B; accept as B). Do the Part 7 role toggle from A's Family Sharing screen.

Record each user's UUID (Supabase → Authentication → Users → copy the `id`): `A_ID`, `B_ID`.

### 0.2 Start the app with the flag ON
`start-dev.bat` already sets `NEXT_PUBLIC_CLIENT_DIRECT=1`. Otherwise, in `apps/web/.env.local`:

```
NEXT_PUBLIC_CLIENT_DIRECT=1
```

Then start the web app and open **http://localhost:3002**. Confirm `apps/web/.env.local` has
`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co` and the anon key. Note your `<ref>`.

> A restart is required whenever you change `NEXT_PUBLIC_CLIENT_DIRECT` — it's inlined at build/dev
> start. There's a service worker: after restarting, do a hard reload (DevTools open → right-click
> Reload → **Empty Cache and Hard Reload**), or tick DevTools → Application → Service Workers →
> **Update on reload** for the session.

### 0.3 Open the tools you'll use (Chrome/Edge DevTools, F12)
- **Network** tab → filter box. You'll switch the filter between `rest/v1` (Supabase Data API) and
  `/api/` (the old Vercel routes).
- **Application** tab → **IndexedDB** → you're looking for a DB named **`vitatrack-clientq`** with
  two stores: **`writes`** (offline queue) and **`reads`** (read cache).
- **Application** tab → **Service Workers** (to force offline) — or use the Network **throttling**
  dropdown → **Offline**.
- A second tab open to the **Supabase dashboard → Table editor** to eyeball rows landing in
  `af-south-1`.

---

## 1. Confirm client-direct routing (the whole point)

1. Sign in as **User A**. Land on `/dashboard`.
2. DevTools → **Network**, filter = `rest/v1`. Reload the dashboard.
3. ✅ **Expect:** several `GET https://<ref>.supabase.co/rest/v1/...` requests (medications, vitals,
   dose_logs). Status 200.
4. Change the filter to `/api/`. 
5. ✅ **Expect:** **no** `GET/POST http://localhost:3002/api/vitals|medications|dose-logs|...`
   requests for page data. (You may still see `/api/cron/...` unrelated; that's fine — it's the
   R4/Phase D cleanup, not this test.)
6. ❌ **Fail if:** any PHI read/write shows a request to `localhost:3002/api/*`. That means the flag
   isn't active (check step 0.2 + hard reload).

> Everything below assumes this passed. Keep the Network tab handy — for each write, glance that it
> hit `rest/v1/<table>` and not `/api/*`.

---

## 2. Writes online (each surface)

For every item: perform the click path, then in **Network** (filter `rest/v1`) confirm the matching
`POST`/`PATCH`/`DELETE https://<ref>.supabase.co/rest/v1/<table>` with a 2xx status, and confirm the
row in the Supabase **Table editor**.

| # | Click path | Expect request | Table |
|---|---|---|---|
| 2.1 Vital | `/dashboard/vitals` → **+ Add reading** → Type *Blood Pressure*, Systolic 120, Diastolic 80 → **Save reading** | `POST rest/v1/vitals` 201 | `vitals` |
| 2.2 Medication | `/dashboard/medications` → **+ Add medication** → Name "QA Test Med", Frequency *Daily*, time 08:00 → **Save medication** | `POST rest/v1/medications` **and** `POST rest/v1/medication_schedules` | `medications`, `medication_schedules` |
| 2.3 Take dose | On the "QA Test Med" card → **✓ Take** | `POST rest/v1/dose_logs` 201 (`status=taken`) | `dose_logs` |
| 2.4 Skip dose | Same card → **Skip** | `POST rest/v1/dose_logs` (`status=skipped`) | `dose_logs` |
| 2.5 Edit med | Card → **✏️** → change Strength to 5 → **Save changes** | `PATCH rest/v1/medications?id=eq...`; then `DELETE`+`POST rest/v1/medication_schedules` | `medications` |
| 2.6 Archive med | Card → **🗑** → confirm | `PATCH rest/v1/medications` (`is_active=false`, `archived_at` set) | `medications` |
| 2.7 Visit | `/dashboard/records` → **+ Add visit** → Type *GP*, today's date, Provider "Dr QA" → **Save visit** | `POST rest/v1/doctor_visits` 201 | `doctor_visits` |
| 2.8 Document | `/dashboard/records` → **+ Upload document** → pick a small PDF/JPG, Category *Lab result* → **Upload** | Storage `POST .../storage/v1/object/health-documents/<A_ID>/...` **then** `POST rest/v1/health_documents` | `health_documents` |
| 2.9 ICE | `/dashboard/ice` → Blood type *O+*, Allergy "Penicillin", add a contact → **Save** | `POST rest/v1/ice_profiles` (upsert) | `ice_profiles` |
| 2.10 Profile | `/dashboard/settings` → change Full Name → **Save Changes** | `POST/PATCH rest/v1/profiles` (upsert) | `profiles` |
| 2.11 Reminders* | `/dashboard/settings` → Medication reminders → **Turn on** → allow the browser notification prompt | `POST rest/v1/push_tokens` (upsert) | `push_tokens` |

*2.11 needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY` set and a browser that supports Web Push; if not
configured you'll see the "reminders aren't configured" note — skip and mark N/A.

Scan (2.x optional, needs a camera): from `/dashboard/vitals` → **📷 Scan device**, capture a BP
screen; on save expect `POST rest/v1/scan_captures` then `POST rest/v1/vitals` with `source=scan`
and a `capture_id`. Covered again in Part 8.

✅ **Pass:** every performed row hits `rest/v1/<table>` (never `/api/*`) and the row appears in
Supabase.

---

## 3. Reads render on every page

Visit each page as User A and confirm it renders real data (not a permanent skeleton, no console
errors). Each should fire `GET rest/v1/...`, not `/api/*`.

- `/dashboard` — vitals cards, 90-day adherence, active meds, recent vitals table.
- `/dashboard/vitals` — tabs, chart, table (try the type tabs + range 7/30/90/365).
- `/dashboard/medications` — active + archived sections; open a med → `/dashboard/medications/<id>`
  shows adherence, supply, schedule, recent doses.
- `/dashboard/records` — visits + documents.
- `/dashboard/notifications` — refill alerts / pending / missed (may be empty = "all caught up").
- `/dashboard/ice` — the profile you saved in 2.9.
- `/dashboard/settings` — profile fields populated.
- `/dashboard/caregivers` — Family Sharing loads.

✅ **Pass:** all render from `rest/v1`. ❌ **Fail:** a page stuck on the loading skeleton or a red
console error → capture the console output.

---

## 4. Offline write → queue → replay (no duplicate)

1. As User A, go to `/dashboard/vitals`.
2. DevTools → **Network** → throttling dropdown → **Offline** (or Application → Service Workers →
   tick **Offline**).
3. **+ Add reading** → Glucose 5.5 → **Save reading**. 
   ✅ The modal closes with **no error** (optimistic "queued").
4. DevTools → **Application → IndexedDB → `vitatrack-clientq` → `writes`**. 
   ✅ **Expect exactly one** record: `{ op:'insert', table:'vitals', row:{ id:<uuid>, ... } }`.
5. In the app header/PWA indicator you should see a pending-sync count of 1 (from the R12 indicator).
6. Turn **Offline off** (back online). Within a moment the `online` handler drains the queue — or
   reload the page once.
   ✅ `writes` store is now **empty**; a `POST rest/v1/vitals` appears in Network; the glucose row is
   in Supabase.
7. **No-duplicate check:** reload the page **twice** more. ✅ Still exactly **one** glucose row in
   Supabase (the client-uuid + 23505 idempotency guard). ❌ Fail if a second identical row appears.

**Kill-mid-queue variant (optional):** repeat 2–3 to enqueue, then (still offline) close the tab.
Reopen `localhost:3002` and go back online. ✅ The queued write replays on load; no duplicate.

---

## 5. Offline read from cache

1. Online, visit `/dashboard/vitals` and `/dashboard/medications` so their reads populate the cache.
   Check **Application → IndexedDB → `vitatrack-clientq` → `reads`** — you should see keyed entries
   (`vitals:<A_ID>:blood_pressure:30`, `medications:<A_ID>`, …).
2. Go **Offline** (Network throttling).
3. Reload `/dashboard/vitals`.
   ✅ **Expect:** the page still shows your readings, with an amber banner **"Showing saved data —
   you appear to be offline."** No blank page, no crash.
4. Go back online, reload → banner gone, fresh data.

---

## 6. RLS cross-tenant denial (two accounts)

### 6.1 Read denial via the UI (reliable)
1. In Supabase, copy one of **User A's** medication `id` (Table editor → `medications`) → `A_MED_ID`.
2. Sign out. Sign in as **User B** (unrelated, not a caregiver of A).
3. Navigate directly to `http://localhost:3002/dashboard/medications/A_MED_ID`.
   ✅ **Expect:** "Medication not found." (RLS filtered A's row out of B's client-direct query.)
4. As B, `/dashboard/vitals` / `/dashboard/records` show **only B's** data (empty if B is fresh).
   ✅ **Expect:** none of A's readings/visits/docs appear.

### 6.2 Write denial via REST (definitive)
This proves a hostile client can't write into A's rows even by forging `profile_id`.

1. Still signed in as **User B**, open DevTools → **Network**, filter `rest/v1`, click any request,
   and from **Request Headers** copy the full **`Authorization: Bearer <token>`** value (B's JWT) and
   the **`apikey`** value (the anon key).
2. In a terminal, attempt to insert a vital into **A's** profile using **B's** token:

```bash
curl -i -X POST 'https://<ref>.supabase.co/rest/v1/vitals' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Authorization: Bearer <B_JWT>' \
  -H 'Content-Type: application/json' \
  -d '{"profile_id":"<A_ID>","type":"weight","weight_value":50}'
```

   ✅ **Expect:** HTTP **401/403** with a body like *"new row violates row-level security policy for
   table \"vitals\""*. ❌ **Fail (critical):** a 201 / the row appears — stop and do not enable the
   flag.
3. Sanity: repeat with `"profile_id":"<B_ID>"` → ✅ **201** (B can write its own row). Delete the
   test row afterwards.

> This is a spot-check. The rigorous, repeatable RLS matrix is the pgTAP suite tracked as R9 — run
> that in CI before launch.

---

## 7. Caregiver roles (dose_logger vs viewer)

Precondition: B has accepted a caregiver invite from A (Settings → Family Sharing).

### 7.1 Viewer is read-only
1. As **A**, Family Sharing → set B's role to **Viewer**.
2. Sign in as **B**. `/dashboard` now shows **A's** overview ("A's Health Overview", Caregiver View
   badge). ✅ Reads work (family-read RLS).
3. On a medication card, click **✓ Take**.
   ✅ **Expect:** a flash **"Viewer access only — Dose Logger role required"**; **no** `POST
   rest/v1/dose_logs` in Network.
4. Confirm B sees **no** edit/archive affordances on A's meds (caregiver view).

### 7.2 Dose logger can log, still can't edit
1. As **A**, set B's role to **Dose Logger**.
2. As **B**, medication card → **✓ Take**.
   ✅ **Expect:** `POST rest/v1/dose_logs` 201 with `profile_id=A_ID`, `logged_by=B_ID`; the dose
   appears in A's history.
3. Attempt to edit a med (if the pencil is shown) — a `PATCH rest/v1/medications` should affect **0
   rows** (RLS own-CRUD is A-only). ✅ Nothing changes for A.

---

## 8. Capture provenance (scan)

Needs a camera. As A, `/dashboard/vitals` → **📷 Scan device** → capture a BP monitor screen →
review → **Save**.
✅ **Expect:** `POST rest/v1/scan_captures` (returns an id) then `POST rest/v1/vitals` carrying
`source:'scan'` (or `'qr'` for a signed QR) and `capture_id` = that id. Verify the `vitals` row's
`source`/`capture_id` in Supabase.

---

## 9. Sign-out purge (no PHI lingers)

1. As any signed-in user with data cached, confirm **Application → IndexedDB → `vitatrack-clientq`**
   exists (with `reads`/`writes` content).
2. Sign out via the nav **Sign out**.
3. ✅ **Expect:** `vitatrack-clientq` is **gone** from IndexedDB (dropped by `clearOfflineData`).
   Also check the `vt-*` Cache Storage entries are cleared.
4. Repeat via the **app-lock** sign-out (lock screen → Sign out) and the **Settings → Delete My
   Account** flow — both should also drop `vitatrack-clientq`.

---

## 10. Flag-OFF regression (safety net intact)

1. Stop the app. Set `NEXT_PUBLIC_CLIENT_DIRECT=0` (or blank) in `apps/web/.env.local`. Restart.
   Hard-reload.
2. As A, `/dashboard/vitals` → **+ Add reading** → save.
   ✅ **Expect:** Network shows `POST http://localhost:3002/api/vitals` (the old route) — **not**
   `rest/v1`. The reading saves. Every page still works.
3. This confirms the `/api` fallback is fully intact, so the flag is a safe on/off switch until
   Phase C deletes the routes.

---

## Results checklist

| Part | Check | Pass/Fail | Notes |
|---|---|---|---|
| 1 | PHI traffic → `rest/v1`, none to `/api/*` | | |
| 2.1–2.11 | Each write hits `rest/v1/<table>` + row in Supabase | | |
| 3 | All dashboard pages render from `rest/v1` | | |
| 4 | Offline enqueue → replay once, no duplicate | | |
| 5 | Offline reads served from cache + banner | | |
| 6.1 | Cross-tenant read blocked (UI "not found") | | |
| 6.2 | Cross-tenant write blocked (REST 401/403) | | |
| 7.1 | Viewer blocked from logging doses | | |
| 7.2 | Dose logger can log, can't edit | | |
| 8 | Scan writes capture + provenance on vital | | |
| 9 | Sign-out drops `vitatrack-clientq` (all 3 paths) | | |
| 10 | Flag-off falls back to `/api/*` cleanly | | |

**Go/No-go:** all rows Pass → the flag is safe to enable in a preview/staging env; proceed to Phase
C (retire `/api`) only after that. **Any Fail in Part 1, 4, 6, or 9 is a blocker** — leave the flag
off and file the failing case.
