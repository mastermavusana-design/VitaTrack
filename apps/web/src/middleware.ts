/**
 * Next.js middleware — refreshes Supabase session on every request.
 * Routes under /dashboard require authentication; all others are public.
 */
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse }            from 'next/server'
import type { NextRequest }        from 'next/server'

export async function middleware(req: NextRequest) {
  const res      = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Refresh session if expired (keeps cookies in sync)
  const { data: { session } } = await supabase.auth.getSession()

  const url = req.nextUrl.clone()

  // Protect /dashboard/*
  if (url.pathname.startsWith('/dashboard') && !session) {
    url.pathname = '/login'
    url.searchParams.set('returnTo', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Redirect already-logged-in users away from /login
  if (url.pathname === '/login' && session) {
    url.pathname = '/dashboard'
    url.searchParams.delete('returnTo')
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: [
    // Run on all routes except static files and _next internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
