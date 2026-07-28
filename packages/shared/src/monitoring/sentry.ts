// ── Lightweight error monitoring ──────────────────────────────
// A dependency-free wrapper that forwards captured errors to Sentry's
// HTTP "store" endpoint when SENTRY_DSN is configured, and no-ops
// otherwise. This keeps the bundle light and CI fast while giving us a
// single call site (captureException / captureMessage) to swap for the
// full @sentry SDK later without touching call sites.
//
// Design notes:
//  • Never throws — monitoring must not become a new failure mode.
//  • Reads DSN lazily from the environment (SENTRY_DSN, or the public
//    NEXT_PUBLIC_/EXPO_PUBLIC_ variants) so it works on server, web, and
//    mobile without per-surface wiring.
//  • Fire-and-forget: returns void; callers never await it.

type Extra = Record<string, unknown>

export type MonitoringLevel = 'fatal' | 'error' | 'warning' | 'info'

type ParsedDsn = {
  endpoint: string
  publicKey: string
  projectId: string
}

let cachedDsn: ParsedDsn | null | undefined

function readDsnString(): string | undefined {
  const env: Record<string, string | undefined> =
    typeof process !== 'undefined' && process.env ? process.env : {}
  return (
    env.SENTRY_DSN ||
    env.NEXT_PUBLIC_SENTRY_DSN ||
    env.EXPO_PUBLIC_SENTRY_DSN ||
    undefined
  )
}

/** Parse a Sentry DSN into the envelope/store endpoint + auth parts. */
export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null
  try {
    const url = new URL(dsn)
    const projectId = url.pathname.replace(/^\/+/, '')
    if (!url.username || !projectId) return null
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/store/`
    return { endpoint, publicKey: url.username, projectId }
  } catch {
    return null
  }
}

function getDsn(): ParsedDsn | null {
  if (cachedDsn === undefined) cachedDsn = parseDsn(readDsnString())
  return cachedDsn
}

/** For tests: force re-reading the DSN from the environment. */
export function resetMonitoring(): void {
  cachedDsn = undefined
}

/** True when a valid DSN is configured and events will be sent. */
export function isMonitoringEnabled(): boolean {
  return getDsn() !== null
}

function newEventId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return `${Date.now()}${Math.floor(Math.random() * 1e9)}`
  }
}

function send(payload: Record<string, unknown>): void {
  const dsn = getDsn()
  if (!dsn) return
  // Only attempt network delivery where fetch exists (Node 18+, browsers, RN).
  if (typeof fetch !== 'function') return

  const body = JSON.stringify({
    event_id: newEventId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    ...payload,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Sentry-Auth': [
      'Sentry sentry_version=7',
      'sentry_client=vitatrack-lite/1.0',
      `sentry_key=${dsn.publicKey}`,
    ].join(', '),
  }

  // Fire-and-forget; swallow all delivery errors.
  void Promise.resolve()
    .then(() => fetch(dsn.endpoint, { method: 'POST', headers, body }))
    .catch(() => {})
}

/** Capture an exception. Safe to call unconditionally. */
export function captureException(
  error: unknown,
  context?: { extra?: Extra; tags?: Record<string, string>; level?: MonitoringLevel },
): void {
  try {
    if (!isMonitoringEnabled()) return
    const err = error instanceof Error ? error : new Error(String(error))
    send({
      level: context?.level ?? 'error',
      tags: context?.tags,
      extra: context?.extra,
      exception: {
        values: [
          {
            type: err.name || 'Error',
            value: err.message,
            stacktrace: err.stack ? { frames: [{ function: err.stack.split('\n')[1]?.trim() }] } : undefined,
          },
        ],
      },
    })
  } catch {
    /* monitoring must never throw */
  }
}

/** Capture a plain message (e.g. a soft warning). */
export function captureMessage(
  message: string,
  context?: { extra?: Extra; tags?: Record<string, string>; level?: MonitoringLevel },
): void {
  try {
    if (!isMonitoringEnabled()) return
    send({
      level: context?.level ?? 'info',
      message,
      tags: context?.tags,
      extra: context?.extra,
    })
  } catch {
    /* monitoring must never throw */
  }
}
