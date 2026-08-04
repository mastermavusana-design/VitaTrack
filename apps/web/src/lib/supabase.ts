import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import { createClient }                                from '@supabase/supabase-js'
import { cookies }                                     from 'next/headers'

/**
 * Server Supabase client (R3 — @supabase/ssr). Cookie-based auth session.
 * Use in Server Components and Route Handlers. In a Server Component the cookie
 * `setAll` is a no-op (writes aren't allowed there) — the middleware refreshes the
 * session cookie, so this is safe.
 */
export function createServerClient() {
  const store = cookies()
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            /* called from a Server Component — ignore; middleware keeps the cookie fresh */
          }
        },
      },
    },
  )
}

/**
 * Public (anon) Supabase client — for unauthenticated reads (ICE public page).
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

/**
 * Service-role Supabase client — for server-side trusted operations.
 * NEVER expose to client.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
