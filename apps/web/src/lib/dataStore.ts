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
 * Idempotent replay: every queued row carries a client-generated uuid `id`, so a
 * replay of a write that actually reached the server first fails with a unique
 * violation (23505) and is treated as already-applied.
 */

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

const DB_NAME = 'vitatrack-clientq'
const STORE = 'writes'

export type QueuedWrite = { id?: number; table: string; row: Record<string, unknown>; ts: number }

/* ─── IndexedDB helpers ──────────────────────────────────────────────────── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
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

async function enqueue(table: string, row: Record<string, unknown>): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqAsPromise(tx.objectStore(STORE).add({ table, row, ts: Date.now() }))
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

/* ─── Public API ─────────────────────────────────────────────────────────── */

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

export type WriteResult =
  | { ok: true; queued?: false; data: unknown }
  | { ok: true; queued: true }
  | { ok: false; error: string }

/**
 * Insert a row into `table` via the Data API. If offline or the request fails at
 * the network layer, the row is queued and replayed later. A returned DB error
 * (RLS denial, constraint violation) is surfaced, not queued — it would fail on
 * replay too.
 */
export async function queuedInsert(table: string, row: Record<string, unknown>): Promise<WriteResult> {
  const withId: Record<string, unknown> = { id: globalThis.crypto?.randomUUID?.(), ...row }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueue(table, withId)
    await broadcast()
    return { ok: true, queued: true }
  }

  try {
    const supabase = createClientComponentClient()
    const { data, error } = await supabase.from(table).insert(withId).select().single()
    if (error) {
      // A returned PostgREST error means the server was reached (real DB/RLS error).
      return { ok: false, error: error.message }
    }
    return { ok: true, data }
  } catch {
    // Thrown → network failure → queue for replay.
    await enqueue(table, withId)
    await broadcast()
    return { ok: true, queued: true }
  }
}

/** Drain the offline write queue. Called on load and on `online`. */
export async function replayQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  let items: QueuedWrite[]
  try {
    items = await getAll()
  } catch {
    return
  }
  const supabase = createClientComponentClient()
  for (const it of items) {
    try {
      const { error } = await supabase.from(it.table).insert(it.row).select().maybeSingle()
      if (!error) {
        await del(it.id!)                       // applied
      } else if ((error as { code?: string }).code === '23505') {
        await del(it.id!)                       // duplicate → already applied (idempotent)
      } else if ((error as { code?: string }).code) {
        console.error('[dataStore] dropping un-replayable write', it.table, error)
        await del(it.id!)                       // permanent error → drop, don't retry forever
      } else {
        break                                    // no code → treat as transient, stop
      }
    } catch {
      break                                      // still offline → stop, retry next time
    }
  }
  await broadcast()
}

let inited = false
/** Attach the online-replay listener and drain once. No-op unless the flag is on. */
export function initClientQueue(): void {
  if (inited || !CLIENT_DIRECT || typeof window === 'undefined') return
  inited = true
  window.addEventListener('online', () => { void replayQueue() })
  void replayQueue()
}
