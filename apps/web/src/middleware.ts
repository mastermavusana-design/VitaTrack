/**
 * Next.js middleware — refreshes the Supabase session on every request (R3 — @supabase/ssr).
 * Routes under /dashboard require authentication; all others are public.
 */
import { createServerClient }  from '@supabase/ssr'
import { NextResponse }         from 'next/server'
import type { NextRequest }     from 'next/server'

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: { headers: req.headers } })
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  // Refresh session if expired (keeps cookies in sync) + read the verified user.
  const { data: { user } } = await supabase.auth.getUser()

  const url = req.nextUrl.clone()

  // Protect /dashboard/*
  if (url.pathname.startsWith('/dashboard') && !user) {
    url.pathname = '/login'
    url.searchParams.set('returnTo', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Redirect already-logged-in users away from /login
  if (url.pathname === '/login' && user) {
    url.pathname = '/dashboard'
    url.searchParams.delete('returnTo')
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: [
    // Run on all routes except static files, _next internals, and PWA assets
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
