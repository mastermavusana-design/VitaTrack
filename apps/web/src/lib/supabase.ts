import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { createClient }               from '@supabase/supabase-js'
import { cookies }                    from 'next/headers'

/**
 * Server Component Supabase client — uses cookie-based auth session.
 * Use in Server Components and Route Handlers.
 */
export function createServerClient() {
  const cookieStore = cookies()
  return createServerComponentClient({ cookies: () => cookieStore })
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
