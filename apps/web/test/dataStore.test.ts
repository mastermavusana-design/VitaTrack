import { beforeEach, describe, expect, it } from 'vitest'
import {
  queuedInsert, queuedUpdate, queuedDelete, queuedUpsert,
  replayQueue, pendingCount, cachedSelect, purgeClientCaches,
  resolveOwnerContext,
} from '@/lib/dataStore'

declare const globalThis: any

function setHandler(fn: (s: any) => { data: any; error: any }) { globalThis.__handler = fn }
const calls = (): any[] => (globalThis.__calls ?? [])

beforeEach(() => {
  globalThis.__resetIDB()
  globalThis.__calls = []
  globalThis.__handler = undefined
  globalThis.__session = undefined
  globalThis.__setOnline(true)
})

describe('writes — online', () => {
  it('inserts directly and does not queue', async () => {
    const res = await queuedInsert('vitals', { type: 'weight', weight_value: 70 })
    expect(res.ok).toBe(true)
    expect((res as any).queued).toBeFalsy()
    expect(await pendingCount()).toBe(0)
    const insert = calls().find(c => c.op === 'insert')
    expect(insert?.table).toBe('vitals')
    expect(insert?.payload.id).toBeTruthy() // client-generated uuid for idempotency
  })

  it('surfaces an RLS/constraint error without queuing (server was reached)', async () => {
    setHandler(() => ({ data: null, error: { message: 'permission denied', code: '42501' } }))
    const res = await queuedInsert('vitals', { type: 'weight', weight_value: 70 })
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/permission denied/)
    expect(await pendingCount()).toBe(0)
  })
})

describe('writes — offline enqueue + replay', () => {
  it('queues an insert offline, then replays exactly once when back online', async () => {
    globalThis.__setOnline(false)
    const res = await queuedInsert('vitals', { type: 'glucose', glucose_value: 5 })
    expect((res as any).queued).toBe(true)
    expect(await pendingCount()).toBe(1)
    expect(calls().some(c => c.op === 'insert')).toBe(false) // nothing sent while offline

    globalThis.__setOnline(true)
    await replayQueue()
    expect(await pendingCount()).toBe(0)
    expect(calls().filter(c => c.op === 'insert' && c.table === 'vitals')).toHaveLength(1)
  })

  it('drops a duplicate (23505) on replay — idempotent, no infinite retry', async () => {
    globalThis.__setOnline(false)
    await queuedInsert('vitals', { type: 'weight', weight_value: 80 })
    globalThis.__setOnline(true)
    setHandler(() => ({ data: null, error: { code: '23505', message: 'duplicate key' } }))
    await replayQueue()
    expect(await pendingCount()).toBe(0)
  })

  it('drops a permanent error (has code) rather than retrying forever', async () => {
    globalThis.__setOnline(false)
    await queuedInsert('vitals', { type: 'weight', weight_value: 80 })
    globalThis.__setOnline(true)
    setHandler(() => ({ data: null, error: { code: '23502', message: 'not-null violation' } }))
    await replayQueue()
    expect(await pendingCount()).toBe(0)
  })

  it('keeps a transient error (no code) queued for a later retry', async () => {
    globalThis.__setOnline(false)
    await queuedInsert('vitals', { type: 'weight', weight_value: 80 })
    globalThis.__setOnline(true)
    setHandler(() => ({ data: null, error: { message: 'network blip' } })) // no .code
    await replayQueue()
    expect(await pendingCount()).toBe(1) // still queued
  })
})

describe('update / delete / upsert', () => {
  it('queues + replays an update with its match filter', async () => {
    globalThis.__setOnline(false)
    await queuedUpdate('medications', { is_active: false }, { id: 'med-1' })
    expect(await pendingCount()).toBe(1)
    globalThis.__setOnline(true)
    await replayQueue()
    const upd = calls().find(c => c.op === 'update')
    expect(upd?.table).toBe('medications')
    expect(upd?.match).toEqual({ id: 'med-1' })
    expect(await pendingCount()).toBe(0)
  })

  it('queues + replays a delete', async () => {
    globalThis.__setOnline(false)
    await queuedDelete('push_tokens', { id: 'tok-1' })
    globalThis.__setOnline(true)
    await replayQueue()
    expect(calls().some(c => c.op === 'delete' && c.table === 'push_tokens')).toBe(true)
    expect(await pendingCount()).toBe(0)
  })

  it('queues + replays an upsert with its onConflict target', async () => {
    globalThis.__setOnline(false)
    await queuedUpsert('ice_profiles', { profile_id: 'user-self', blood_type: 'O+' }, 'profile_id')
    globalThis.__setOnline(true)
    await replayQueue()
    const up = calls().find(c => c.op === 'upsert')
    expect(up?.onConflict).toBe('profile_id')
    expect(await pendingCount()).toBe(0)
  })
})

describe('cachedSelect (read-through cache)', () => {
  it('returns live rows online and caches them; serves cache when offline', async () => {
    setHandler((s) => s.op === 'select' ? ({ data: [{ id: 1, v: 'a' }], error: null }) : ({ data: null, error: null }))
    const online = await cachedSelect('vitals:me', (sb: any) => sb.from('vitals').select('*').eq('profile_id', 'me').limit(10))
    expect(online.fromCache).toBe(false)
    expect(online.rows).toHaveLength(1)

    globalThis.__setOnline(false)
    const offline = await cachedSelect('vitals:me', (sb: any) => sb.from('vitals').select('*').eq('profile_id', 'me').limit(10))
    expect(offline.fromCache).toBe(true)
    expect(offline.rows).toEqual([{ id: 1, v: 'a' }])
  })
})

describe('purgeClientCaches', () => {
  it('clears both the write queue and the read cache', async () => {
    setHandler((s) => s.op === 'select' ? ({ data: [{ id: 9 }], error: null }) : ({ data: null, error: null }))
    await cachedSelect('k', (sb: any) => sb.from('t').select('*'))       // populate read cache
    globalThis.__setOnline(false)
    await queuedInsert('vitals', { type: 'weight' })                     // populate write queue
    expect(await pendingCount()).toBe(1)

    await purgeClientCaches()
    expect(await pendingCount()).toBe(0)
    const afterOffline = await cachedSelect('k', (sb: any) => sb.from('t').select('*'))
    expect(afterOffline.rows).toEqual([])                                // cache gone
  })
})

describe('resolveOwnerContext (caregiver resolution)', () => {
  it('acts as self when there is no accepted family membership', async () => {
    const ctx = await resolveOwnerContext()
    expect(ctx).toMatchObject({ profileId: 'user-self', selfId: 'user-self', role: 'owner' })
  })

  it('resolves to the owner + family role for a caregiver', async () => {
    setHandler((s) => s.table === 'family_members'
      ? ({ data: { owner_id: 'owner-1', role: 'dose_logger' }, error: null })
      : ({ data: [], error: null }))
    const ctx = await resolveOwnerContext()
    expect(ctx).toMatchObject({ profileId: 'owner-1', selfId: 'user-self', role: 'dose_logger' })
  })
})
