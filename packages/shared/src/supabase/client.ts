import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Types (inline until supabase gen types is run) ──────────
// After setup run: supabase gen types typescript --project-id <id> > database.types.ts
// Then replace `any` below with the generated Database type.
// Placeholder until `supabase gen types` generates the real Database type (see note above).
type Database = any

let _client: SupabaseClient<Database> | null = null

/**
 * Returns a singleton Supabase client.
 * Pass supabaseUrl + anonKey for server/edge environments.
 * Falls back to NEXT_PUBLIC_ / EXPO_PUBLIC_ env vars.
 */
export function getSupabaseClient(
  supabaseUrl?: string,
  anonKey?: string,
): SupabaseClient<Database> {
  if (_client) return _client

  const url =
    supabaseUrl ??
    (typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_SUPABASE_URL ??
        process.env.EXPO_PUBLIC_SUPABASE_URL
      : undefined)

  const key =
    anonKey ??
    (typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      : undefined)

  if (!url || !key) {
    throw new Error(
      '[VitaTrack] Supabase URL and anon key are required. ' +
        'Set EXPO_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL in your .env file.',
    )
  }

  _client = createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: { 'x-app-name': 'vitatrack' },
    },
  })

  return _client
}

/** Reset singleton — useful in tests */
export function resetSupabaseClient() {
  _client = null
}

export type { SupabaseClient }
