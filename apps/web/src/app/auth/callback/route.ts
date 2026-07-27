/**
 * Supabase auth callback route.
 * Handles the code exchange for magic links and OAuth (e.g. Google Sign-In).
 * Next.js Route Handler — runs on the server.
 */
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies }                   from 'next/headers'
import { NextResponse }              from 'next/server'
import type { NextRequest }          from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code       = requestUrl.searchParams.get('code')
  const returnTo   = requestUrl.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = cookies()
    const supabase    = createRouteHandlerClient({ cookies: () => cookieStore })
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(returnTo, requestUrl.origin))
}
