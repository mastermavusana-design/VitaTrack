# VitaTrack

A POPIA-focused health companion for the South African market — medication tracking, vitals logging, health records, caregiver sharing, and an emergency (ICE) profile. Offline-first mobile app, web companion, and a Supabase backend (Postgres, Auth, Storage, Data API) in the `af-south-1` (Cape Town) region.

> **Data residency.** The Supabase database, Auth, Storage, and Data API run in `af-south-1`
> (Cape Town). PHI processing on the web tier is governed by the `NEXT_PUBLIC_CLIENT_DIRECT` flag:
>
> - **Flag off (current production default):** the Next.js API routes and the reminder cron run on
>   Vercel (EU), so some web requests still process SA health data outside the country. This is the
>   state being retired.
> - **Flag on (client-direct, built and flag-gated):** the browser reads and writes the `af-south-1`
>   Data API **directly under RLS** — every PHI read/write (vitals, medications, dose logs, visits,
>   documents, scan captures, ICE, profile, push tokens) stays in-region, with an offline write
>   queue + read cache. The migrated `/api/*` routes fail closed (410) so no stray call processes
>   PHI on Vercel, and web-push reminders move to an in-region Supabase Edge Function
>   (`send-reminders`). Vercel then serves only the app shell + auth gate. The few secret-requiring
>   ops (`data-export`, `send-family-invite`, `request-deletion`) run as Edge Functions and process
>   transiently in the nearest region.
>
> Rollout is staged: enable the flag in preview/staging → run `R1_RUNTIME_QA.md` → enable in prod →
> cutover (delete the retired routes, move the cron, set Vercel regions honestly). The plan and
> design live in `R1_BUILD_PLAN.md`, `R1_MIGRATION_DESIGN.md`, and `REMEDIATION_PLAN.md` (R1).

## Monorepo layout

pnpm workspaces + Turbo. Node ≥ 20, pnpm ≥ 9.

| Path | What it is |
|---|---|
| `apps/mobile` | Expo 54 / React Native app (expo-router, WatermelonDB offline store, NativeWind). Auth, meds, vitals, records, ICE, local notifications. |
| `apps/web` | Next.js 14 (App Router) web companion — dashboard, caregiver invites, public ICE page. Ships both the legacy `/api/*` routes (flag off) and a flag-gated **client-direct data layer** (`src/lib/dataStore.ts`: RLS reads/writes to the af-south-1 Data API + offline write queue + read cache). |
| `packages/shared` | Shared TypeScript types, Supabase client factory, and clinical utils (WHO/ESH BP classification, adherence/streak logic, glucose conversion). |
| `supabase` | Postgres schema + RLS migrations and Edge Functions (caregiver alerts, refill reminders, in-region web-push reminders (`send-reminders`), family invites, POPIA data export). |

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm@9`)
- A Supabase project (for full functionality)

## Quick start

```bash
pnpm install

# Web companion → http://localhost:3000
pnpm --filter @vitatrack/web dev

# Mobile app → scan the QR with Expo Go
cd apps/mobile && npx expo start
```

The `setup.sh` script automates install, env-file creation, and a type-check pass:

```bash
chmod +x setup.sh && ./setup.sh
```

## Environment

Copy the example files and fill in your own keys — **never commit real secrets** (`.env*` is gitignored):

- `apps/web/.env.local` ← from `apps/web/.env.example`
- `apps/mobile/.env` ← from `.env.example`

Set `NEXT_PUBLIC_CLIENT_DIRECT=1` in `apps/web/.env.local` to run the residency-correct client-direct
path (see the Data residency note); leave it blank/`0` for the legacy `/api/*` behaviour.

## Common scripts (run from repo root)

| Command | Action |
|---|---|
| `pnpm dev` | Run all apps in parallel (Turbo) |
| `pnpm build` | Build all packages |
| `pnpm type-check` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run tests |

## Backend

Create a Supabase project (`af-south-1`), apply the migrations in `supabase/migrations/`, and deploy the Edge Functions in `supabase/functions/`. Cron schedules are defined in `supabase/config.toml`.

The in-region web-push reminder sender needs VAPID secrets before deploy:

```bash
supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:support@vitatrack.app
supabase functions deploy send-reminders --no-verify-jwt
```

Deploy + verify `send-reminders` **before** removing the Vercel reminder cron (see `R1_BUILD_PLAN.md`
Phase D for the ordering).
