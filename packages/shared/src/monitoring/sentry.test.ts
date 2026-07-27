import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseDsn,
  isMonitoringEnabled,
  resetMonitoring,
  captureException,
  captureMessage,
} from './sentry'

const DSN = 'https://abc123@o1.ingest.sentry.io/456'

describe('parseDsn', () => {
  it('returns null for empty / invalid DSNs', () => {
    expect(parseDsn(undefined)).toBeNull()
    expect(parseDsn('')).toBeNull()
    expect(parseDsn('not-a-url')).toBeNull()
    expect(parseDsn('https://o1.ingest.sentry.io/456')).toBeNull() // no public key
    expect(parseDsn('https://abc123@o1.ingest.sentry.io/')).toBeNull() // no project id
  })

  it('parses a valid DSN into endpoint + key + project', () => {
    const parsed = parseDsn(DSN)
    expect(parsed).not.toBeNull()
    expect(parsed!.publicKey).toBe('abc123')
    expect(parsed!.projectId).toBe('456')
    expect(parsed!.endpoint).toBe('https://o1.ingest.sentry.io/api/456/store/')
  })
})

describe('monitoring toggle', () => {
  const original = process.env.SENTRY_DSN

  beforeEach(() => {
    resetMonitoring()
    delete process.env.SENTRY_DSN
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
    delete process.env.EXPO_PUBLIC_SENTRY_DSN
  })
  afterEach(() => {
    if (original === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = original
    resetMonitoring()
    vi.restoreAllMocks()
  })

  it('is disabled when no DSN is set', () => {
    expect(isMonitoringEnabled()).toBe(false)
  })

  it('is enabled once a DSN is present', () => {
    process.env.SENTRY_DSN = DSN
    resetMonitoring()
    expect(isMonitoringEnabled()).toBe(true)
  })

  it('does not call fetch when disabled', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    captureException(new Error('boom'))
    captureMessage('hi')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('posts to the store endpoint when enabled', async () => {
    process.env.SENTRY_DSN = DSN
    resetMonitoring()
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)

    captureException(new Error('boom'), { tags: { route: '/api/vitals' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toContain('/api/456/store/')
    expect(opts.method).toBe('POST')
    expect(opts.headers['X-Sentry-Auth']).toContain('sentry_key=abc123')
    vi.unstubAllGlobals()
  })

  it('never throws, even if fetch rejects', () => {
    process.env.SENTRY_DSN = DSN
    resetMonitoring()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(() => captureException('a string error')).not.toThrow()
    expect(() => captureMessage('note', { level: 'warning' })).not.toThrow()
    vi.unstubAllGlobals()
  })
})
