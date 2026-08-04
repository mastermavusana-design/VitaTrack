'use client'

/**
 * Client-direct data layer (R1 — writes phase).
 *
 * Lets the browser write to the af-south-1 Data API directly under RLS, with an
 * IndexedDB offline queue + replay — the client-side replacement for the R12
 * service-worker /api write queue (which can't see cross-origin Supabase calls).
 *
 * ⚠️ Gated behind NEXT_PUBLIC_CLIENT_DIRECT='1' (default OFF). When off, nothing
 * here runs and the app keeps using the /api routes. This module needs RUNTIME
 * testing (offline enqueue → reconnect → replay, RLS deny, no-duplicate replay)
 * before the flag is enabled in production — see R1_MIGRATION_DESIGN.md §7.
 *
 * Idempotent replay:
 *  - insert  — every queued row carries a client-generated uuid `id`, so a replay
 *              of a write that actually reached the server first fails with a unique
 *              violation (23505) and is treated as already-applied.
 *  - upsert  — idempotent by its onConflict target.
 *  - update  — naturally idempotent (same patch applied twice = same result).
 *  - delete  — naturally idempotent (deleting an already-gone row is a no-op).
 */

import { createClientComponentClient } from '@/lib/supabaseClient'

export const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

const DB_NAME = 'vitatrack-clientq'
const STORE = 'writes'
const READ_STORE = 'reads'

export type WriteOp = 'insert' | 'update' | 'delete' | 'upsert'

export type QueuedWrite = {
  id?: number
  op?: WriteOp // absent → legacy insert
  table: string
  row?: Record<string, unknown>
  match?: Record<string, unknown>
  onConflict?: string
  ts: number
}

/* ─── IndexedDB helpers ──────────────────────────────────────────────────── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 2)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains(READ_STORE)) db.createObjectStore(READ_STORE, { keyPath: 'key' })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

function reqAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function enqueue(item: Omit<QueuedWrite, 'id' | 'ts'>): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqAsPromise(tx.objectStore(STORE).add({ ...item, ts: Date.now() }))
}

async function getAll(): Promise<QueuedWrite[]> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  return reqAsPromise(tx.objectStore(STORE).getAll() as IDBRequest<QueuedWrite[]>)
}

async function del(id: number): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqAsPromise(tx.objectStore(STORE).delete(id))
}

export async function pendingCount(): Promise<number> {
  try {
    const all = await getAll()
    return all.length
  } catch {
    return 0
  }
}

function broadcastPending(n: number): void {
  window.dispatchEvent(new CustomEvent('vitatrack:clientq', { detail: n }))
}

async function broadcast(): Promise<void> {
  broadcastPending(await pendingCount())
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/* ─── Session / caregiver resolution ─────────────────────────────────────── */

/** Current user id from the client session (non-authoritative; RLS enforces server-side). */
export async function currentUserId(): Promise<string | null> {
  try {
    const supabase = createClientComponentClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.user.id ?? null
  } catch {
    return null
  }
}

export type OwnerContext = {
  /** Whose data to write against (owner if caregiver, else self). */
  profileId: string
  /** The signed-in user id (used for `logged_by` on caregiver writes). */
  selfId: string
  /** 'owner' when acting on own data, else the accepted family role. */
  role: 'owner' | 'viewer' | 'dose_logger' | string
}

/**
 * Resolve the profile a write should target. If the caller is an accepted family
 * member, returns the owner's id + the family role; otherwise acts as self.
 * RLS remains the authority — this only shapes the payload + gives nicer UX.
 */
export async function resolveOwnerContext(): Promise<OwnerContext | null> {
  const supabase = createClientComponentClient()
  const { data: sess } = await supabase.auth.getSession()
  const selfId = sess.session?.user.id
  if (!selfId) return null
  const { data: m } = await supabase
    .from('family_members')
    .select('owner_id, role')
    .eq('invitee_id', selfId)
    .eq('status', 'accepted')
    .maybeSingle()
  if (m && (m as any).owner_id) {
    return { profileId: (m as any).owner_id, selfId, role: (m as any).role ?? 'viewer' }
  }
  return { profileId: selfId, selfId, role: 'owner' }
}

/* ─── Write API ──────────────────────────────────────────────────────────── */

export type WriteResult =
  | { ok: true; queued?: false; data: unknown }
  | { ok: true; queued: true }
  | { ok: false; error: string }

/**
 * Insert a row. Offline / network failure → queue + optimistic "queued" result.
 * A returned DB error (RLS denial, constraint) is surfaced, not queued.
 */
export async function queuedInsert(table: string, row: Record<string, unknown>): Promise<WriteResult> {
  const withId: Record<string, unknown> = { id: globalThis.crypto?.randomUUID?.(), ...row }

  if (isOffline()) {
    await enqueue({ op: 'insert', table, row: withId })
    await broadcast()
    return { ok: true, queued: true }
  }
  try {
    const supabase = createClientComponentClient()
    const { data, error } = await supabase.from(table).insert(withId).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch {
    await enqueue({ op: 'insert', table, row: withId })
    await broadcast()
    return { ok: true, queued: true }
  }
}

/** Upsert a row on `onConflict`. Idempotent; safe to replay. */
export async function queuedUpsert(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
): Promise<WriteResult> {
  if (isOffline()) {
    await enqueue({ op: 'upsert', table, row, onConflict })
    await broadcast()
    return { ok: true, queued: true }
  }
  try {
    const supabase = createClientComponentClient()
    const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch {
    await enqueue({ op: 'upsert', table, row, onConflict })
    await broadcast()
    return { ok: true, queued: true }
  }
}

/** Update rows matching `match` with `patch`. */
export async function queuedUpdate(
  table: string,
  patch: Record<string, unknown>,
  match: Record<string, unknown>,
): Promise<WriteResult> {
  if (isOffline()) {
    await enqueue({ op: 'update', table, row: patch, match })
    await broadcast()
    return { ok: true, queued: true }
  }
  try {
    const supabase = createClientComponentClient()
    const { data, error } = await supabase.from(table).update(patch).match(match).select()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch {
    await enqueue({ op: 'update', table, row: patch, match })
    await broadcast()
    return { ok: true, queued: true }
  }
}

/** Delete rows matching `match`. */
export async function queuedDelete(
  table: string,
  match: Record<string, unknown>,
): Promise<WriteResult> {
  if (isOffline()) {
    await enqueue({ op: 'delete', table, match })
    await broadcast()
    return { ok: true, queued: true }
  }
  try {
    const supabase = createClientComponentClient()
    const { data, error } = await supabase.from(table).delete().match(match).select()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch {
    await enqueue({ op: 'delete', table, match })
    await broadcast()
    return { ok: true, queued: true }
  }
}

/* ─── Replay ─────────────────────────────────────────────────────────────── */

/** Drain the offline write queue. Called on load and on `online`. */
export async function replayQueue(): Promise<void> {
  if (isOffline()) return
  let items: QueuedWrite[]
  try {
    items = await getAll()
  } catch {
    return
  }
  const supabase = createClientComponentClient()
  for (const it of items) {
    try {
      const op: WriteOp = it.op ?? 'insert'
      let error: { code?: string; message?: string } | null = null

      if (op === 'insert') {
        ;({ error } = await supabase.from(it.table).insert(it.row!).select().maybeSingle())
      } else if (op === 'upsert') {
        ;({ error } = await supabase.from(it.table).upsert(it.row!, { onConflict: it.onConflict }).select().maybeSingle())
      } else if (op === 'update') {
        ;({ error } = await supabase.from(it.table).update(it.row!).match(it.match!).select())
      } else if (op === 'delete') {
        ;({ error } = await supabase.from(it.table).delete().match(it.match!).select())
      }

      if (!error) {
        await del(it.id!)                          // applied
      } else if (error.code === '23505') {
        await del(it.id!)                          // duplicate insert → already applied
      } else if (error.code) {
        console.error('[dataStore] dropping un-replayable write', op, it.table, error)
        await del(it.id!)                          // permanent error → drop, don't retry forever
      } else {
        break                                      // no code → transient, stop and retry later
      }
    } catch {
      break                                        // still offline → stop, retry next time
    }
  }
  await broadcast()
}

/* ─── Read-through cache (Phase B — reads) ───────────────────────────────── */

type CacheEntry = { key: string; rows: unknown[]; ts: number }

async function readCacheGet(key: string): Promise<unknown[] | null> {
  try {
    const db = await openDb()
    const tx = db.transaction(READ_STORE, 'readonly')
    const entry = await reqAsPromise(tx.objectStore(READ_STORE).get(key) as IDBRequest<CacheEntry | undefined>)
    return entry?.rows ?? null
  } catch {
    return null
  }
}

async function readCachePut(key: string, rows: unknown[]): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(READ_STORE, 'readwrite')
    await reqAsPromise(tx.objectStore(READ_STORE).put({ key, rows, ts: Date.now() }))
  } catch {
    /* cache is best-effort */
  }
}

export type ReadResult<T> = { rows: T[]; fromCache: boolean; error?: string }

/**
 * Run a client-direct SELECT against the af-south-1 Data API, caching the rows in
 * IndexedDB per `cacheKey`. Serves the cache when the read fails or the device is
 * offline — the local-first read path the offline-reads deferral was waiting on.
 *
 * The caller builds the query (so filters/caregiver-resolution stay explicit); RLS
 * is the authority on what rows come back.
 */
export async function cachedSelect<T = any>(
  cacheKey: string,
  run: (supabase: ReturnType<typeof createClientComponentClient>) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<ReadResult<T>> {
  if (isOffline()) {
    const cached = await readCacheGet(cacheKey)
    return { rows: (cached as T[]) ?? [], fromCache: true }
  }
  try {
    const supabase = createClientComponentClient()
    const { data, error } = await run(supabase)
    if (error) {
      const cached = await readCacheGet(cacheKey)
      const msg = (error as { message?: string }).message
      if (cached) return { rows: cached as T[], fromCache: true, error: msg }
      return { rows: [], fromCache: false, error: msg }
    }
    const rows = (data ?? []) as T[]
    await readCachePut(cacheKey, rows)
    return { rows, fromCache: false }
  } catch {
    const cached = await readCacheGet(cacheKey)
    return { rows: (cached as T[]) ?? [], fromCache: true }
  }
}

/** Clear the offline write queue + read cache. Call on sign-out so no PHI lingers. */
export async function purgeClientCaches(): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction([STORE, READ_STORE], 'readwrite')
    tx.objectStore(STORE).clear()
    tx.objectStore(READ_STORE).clear()
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve() })
  } catch {
    /* best-effort */
  }
}

let inited = false
/** Attach the online-replay listener and drain once. No-op unless the flag is on. */
export function initClientQueue(): void {
  if (inited || !CLIENT_DIRECT || typeof window === 'undefined') return
  inited = true
  window.addEventListener('online', () => { void replayQueue() })
  void replayQueue()
}
