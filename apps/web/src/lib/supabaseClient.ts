'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client (R3 — @supabase/ssr).
 *
 * Drop-in replacement for the deprecated `@supabase/auth-helpers-nextjs`
 * `createClientComponentClient`: same name + call signature, so client call sites
 * are unchanged. Uses the cookie-based storage shared with the SSR server client
 * (`lib/supabase.ts`) and the middleware, keeping the session in sync across
 * browser ⇄ server.
 */
export function createClientComponentClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
