import { NextResponse } from 'next/server'

/**
 * R1 Phase C (staged retirement).
 *
 * When client-direct is ON, the browser talks to the af-south-1 Data API directly
 * under RLS, so these Next.js/Vercel route handlers must NOT process PHI anymore —
 * even a stray/bookmarked call should fail closed rather than handle SA health data
 * in the EU. They return 410 Gone in that mode.
 *
 * When the flag is OFF, `retiredIfClientDirect()` returns null and the route runs
 * exactly as before — the fallback safety net stays intact. Physical deletion of
 * these files (and trimming the service worker) happens only once the flag is
 * permanently ON in production and the runtime QA has passed.
 */
export const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export function retiredIfClientDirect(): NextResponse | null {
  if (!CLIENT_DIRECT) return null
  return NextResponse.json(
    {
      error:
        'This endpoint is retired. The web app reads/writes the af-south-1 Data API directly ' +
        '(R1 client-direct). Set NEXT_PUBLIC_CLIENT_DIRECT=0 to re-enable the /api fallback.',
    },
    { status: 410 },
  )
}
