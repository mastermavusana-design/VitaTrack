# VitaTrack

A POPIA-compliant health companion for the South African market — medication tracking, vitals logging, health records, caregiver sharing, and an emergency (ICE) profile. Offline-first mobile app, web companion, and Supabase backend, all hosted in the `af-south-1` region.

## Monorepo layout

pnpm workspaces + Turbo. Node ≥ 20, pnpm ≥ 9.

| Path | What it is |
|---|---|
| `apps/mobile` | Expo 54 / React Native app (expo-router, WatermelonDB offline store, NativeWind). Auth, meds, vitals, records, ICE, local notifications. |
| `apps/web` | Next.js 14 (App Router) web companion — dashboard, caregiver invites, public ICE page, API routes. |
| `packages/shared` | Shared TypeScript types, Supabase client factory, and clinical utils (WHO/ESH BP classification, adherence/streak logic, glucose conversion). |
| `supabase` | Postgres schema + RLS migrations and Edge Functions (caregiver alerts, refill reminders, family invites, POPIA data export). |

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
