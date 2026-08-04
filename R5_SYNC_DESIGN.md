# R5 — Structural Offline Sync (WatermelonDB `synchronize()`) — Design

_Prepared 2026-08-04. Companion to `REMEDIATION_PLAN.md` (R5). R5 Part 1 (the `vitals`
`updated_at` pull-filter fix + migration) is **done**. This is the design for Part 2 (structural),
which must be **built test-first on a device/emulator** — not blind-shipped from the static
sandbox, because sync bugs on a health record cause silent data loss._

## 1. Current state (what `apps/mobile/db/sync.ts` does today)

Hand-rolled pull-then-push against Supabase via `supabase-js`, keyed on a single SecureStore
`lastSyncedAt`:

- **Pull:** per table, `updated_at > since` (dose_logs uses `logged_at`), upsert into WatermelonDB
  matched by `server_id`.
- **Push:** only `doctor_visits`, `dose_logs`, and never-synced `vitals` (`synced_at IS NULL`).
- Only `doctor_visits` has real conflict handling (`is_dirty` guard + `server_updated_at` wins) and
  soft-delete propagation (`deleted_at`).

### Gaps found (the real R5 scope)

| Table | Server soft-delete col | Mobile push | Conflict handling | Notes |
|---|---|---|---|---|
| `doctor_visits` | `deleted_at` ✅ | ✅ | ✅ | The reference implementation. |
| `medications` | `archived_at` ✅ | ❌ **none** | ❌ | Meds created/edited/archived on mobile never sync **up**. |
| `vitals` | ❌ (none) | partial (creates only) | ❌ | Append-only today; `updated_at` added in Part 1. No delete column. |
| `dose_logs` | ❌ (none) | ✅ (creates) | n/a | Append-only event log; no `updated_at`/`deleted_at`. |

So "deletions propagate / edit-on-A-shows-on-B" is only partly meaningful until (a) the append-only
tables get a soft-delete/`updated_at` column **if** deletion/edit is ever a feature, and (b)
medications get a mobile push path.

## 2. Target: WatermelonDB `synchronize()`

Replace the bespoke loop with WatermelonDB's built-in `synchronize({ pullChanges, pushChanges })`,
which manages `lastPulledAt`, batching, and conflict merge for us.

```ts
await synchronize({
  database,
  pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
    // Call ONE server endpoint that returns the WatermelonDB changes shape:
    //   { changes: { [table]: { created: Row[], updated: Row[], deleted: string[] } }, timestamp }
    // for all synced tables where server_updated_at > lastPulledAt.
    return { changes, timestamp }
  },
  pushChanges: async ({ changes, lastPulledAt }) => {
    // Upsert created+updated; soft-delete the `deleted` ids; reject on server-newer (409).
  },
  migrationsEnabledAtVersion: 1,
})
```

### Two viable server contracts

1. **Postgres RPC / Edge Function `sync_pull(last_pulled_at)`** (recommended) — one round trip,
   returns the changes JSON for all tables under the caller's RLS. `sync_push(changes)` applies
   writes transactionally. Keeps the WatermelonDB shape server-side and consistent.
2. **Client-assembled** — `pullChanges` issues one Supabase query per table (`updated_at >
   lastPulledAt`) and reshapes into `created/updated/deleted` client-side. Simpler to ship, more
   round trips; must map server snake_case → the WatermelonDB column names and split
   created-vs-updated by comparing `created_at` to `lastPulledAt`.

### Identity strategy (the key decision)

WatermelonDB `synchronize()` assumes the **record id is the shared canonical id**. This app uses a
separate `server_id` with a distinct local id. Options:

- **A (clean, preferred):** adopt the **server UUID as the WatermelonDB record id** for synced
  tables. New local rows are created with a client-generated UUID that is also the server id (same
  pattern R1's `dataStore` already uses for the web queue). Removes the `server_id` indirection and
  makes `synchronize()` "just work". Requires a local migration to backfill ids.
- **B (bridge):** keep `server_id`; in `pullChanges`/`pushChanges` translate between local id and
  `server_id`. Works, but you reimplement part of what `synchronize()` gives you and it's easy to
  get subtly wrong.

Recommend **A**, aligned with the R1 client-uuid model so web and mobile share one identity scheme.

## 3. Schema prerequisites (migrations, before the mobile rework)

- Decide per table whether edit/delete is a real feature:
  - If `vitals` / `dose_logs` stay **append-only**, document that and skip their delete/update sync
    (they only ever `created`). If not, add `updated_at` (vitals has it) + `deleted_at` + the
    `set_updated_at` trigger to both.
- Add a **mobile medication push** path (create/edit/archive) — today meds only pull. Archive maps
  to `archived_at` + `is_active=false` (parity with the web soft-delete).
- Ensure every synced table exposes a monotonic `updated_at` (trigger already exists for
  medications/visits/ice/profiles; add for any table that will support edits).

## 4. Conflict rule

Last-write-wins keyed on `updated_at`, with a local `is_dirty` guard so unpushed local edits are
never clobbered by a pull (exactly what `doctor_visits` does today). `synchronize()`'s
`onDidPullChanges`/conflict callback centralizes this. Deletes tombstone via `deleted_at`.

## 5. Test plan (device / emulator — required before ship)

Two devices (or two installs) signed into the same account:

- **Edit propagation:** edit a medication on device A → sync both → the change shows on B.
- **Delete/archive propagation:** archive a med on A → after sync it's archived on B (and on web).
- **Offline create → reconnect:** create a vital + dose log offline on A → reconnect → they appear
  on B; no duplicate after a second sync (idempotent by shared UUID).
- **Conflict:** edit the same visit on A (offline) and B → on sync, `updated_at`-wins holds and the
  loser isn't silently dropped (surfaced/logged).
- **RLS:** a second account never receives another user's rows in `pullChanges`.
- **Cold start:** fresh install pulls full history from `lastPulledAt = 0` without timeout.

## 6. Sequencing

1. Schema migrations (§3) + decide append-only vs editable per table.
2. Adopt server-UUID identity (§2A) with a local WatermelonDB migration.
3. Build `sync_pull` / `sync_push` (Edge/RPC) **or** the client-assembled adapter.
4. Replace `syncWithSupabase()` with `synchronize()`; keep the old path behind a flag for one
   release to compare.
5. Run §5 on-device; only then remove the legacy sync.

**Why staged behind a flag:** same principle as R1 Phases C/D — the replacement lands and is proven
on a device before the hand-rolled path is deleted, so a sync regression can't silently lose a
user's health data in production.
