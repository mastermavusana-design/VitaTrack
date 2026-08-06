/* VitaTrack service worker — Web Push + offline PWA (caching + write queue). */

const VERSION = 'v2'
const STATIC_CACHE = `vt-static-${VERSION}`
const RUNTIME_CACHE = `vt-runtime-${VERSION}`
const API_CACHE = `vt-api-${VERSION}`
const OFFLINE_URL = '/offline.html'

// Small, stable set precached on install so the shell works with no network.
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/brand/icon.png']

/* ─── Lifecycle ──────────────────────────────────────────────────────────── */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('vt-') && ![STATIC_CACHE, RUNTIME_CACHE, API_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

/* ─── Fetch routing ──────────────────────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Only manage same-origin traffic; let cross-origin (Supabase, fonts) pass through.
  if (url.origin !== self.location.origin) return

  const isApi = url.pathname.startsWith('/api/')
  const isMutation = req.method !== 'GET' && req.method !== 'HEAD'

  // 1. Offline write queue: mutating /api requests that fail → enqueue + 202.
  if (isApi && isMutation) {
    event.respondWith(networkOrQueue(req))
    return
  }

  if (req.method !== 'GET') return

  // 2. Navigations: network-first, fall back to cache, then the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep the SW alive until the cache write completes. A bare
          // fire-and-forget put can be aborted when the worker is terminated
          // right after the response is delivered, leaving the page uncached
          // (and thus unavailable on a later offline reload).
          const copy = res.clone()
          event.waitUntil(caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)))
          return res
        })
        // ignoreVary: Next.js documents carry `Vary: RSC, Next-Router-*`, so a
        // plain offline reload would otherwise miss the cached page and fall
        // through to the offline screen — breaking "visited pages work offline".
        .catch(
          async () =>
            (await caches.match(req, { ignoreVary: true, ignoreSearch: true })) ||
            (await caches.match(OFFLINE_URL)),
        ),
    )
    return
  }

  // 3. GET /api/*: network-first with cache fallback (last-seen data offline).
  if (isApi) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(API_CACHE).then((c) => c.put(req, res.clone()))
          return res
        })
        .catch(async () => (await caches.match(req)) || jsonResponse({ error: 'offline', offline: true }, 503)),
    )
    return
  }

  // 4. Static assets (_next/static, brand, images, css/js): cache-first + refresh.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()))
          return res
        }),
    ),
  )
})

/* ─── Offline write queue (IndexedDB) ────────────────────────────────────── */

function networkOrQueue(req) {
  return fetch(req.clone()).catch(async () => {
    await enqueueRequest(req)
    try {
      await self.registration.sync.register('vitatrack-mutations')
    } catch {
      /* Background Sync unavailable — client replays on 'online'. */
    }
    await broadcastPending()
    return jsonResponse({ queued: true, offline: true }, 202)
  })
}

const DB_NAME = 'vitatrack-sync'
const STORE = 'mutations'

function openDb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => {
      open.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function enqueueRequest(req) {
  const body = await req.clone().text().catch(() => '')
  const headers = {}
  req.headers.forEach((v, k) => { headers[k] = v })
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqAsPromise(tx.objectStore(STORE).add({ url: req.url, method: req.method, headers, body, ts: Date.now() }))
}

async function getAllQueued() {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  return reqAsPromise(tx.objectStore(STORE).getAll())
}

async function deleteQueued(id) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await reqAsPromise(tx.objectStore(STORE).delete(id))
}

async function pendingCount() {
  const all = await getAllQueued().catch(() => [])
  return Array.isArray(all) ? all.length : 0
}

async function replayQueue() {
  const items = await getAllQueued().catch(() => [])
  if (!Array.isArray(items)) return
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
        credentials: 'include',
      })
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        // Success, or a permanent client error we shouldn't retry forever.
        await deleteQueued(item.id)
      }
    } catch {
      // Still offline — stop; we'll retry on the next sync/online event.
      break
    }
  }
  await broadcastPending()
}

async function broadcastPending() {
  const pending = await pendingCount()
  const clients = await self.clients.matchAll({ includeUncontrolled: true })
  for (const c of clients) c.postMessage({ type: 'vitatrack:sync', pending })
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'vitatrack-mutations') event.waitUntil(replayQueue())
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'vitatrack:replay') event.waitUntil(replayQueue())
  if (data.type === 'vitatrack:pending') event.waitUntil(broadcastPending())
  if (data.type === 'vitatrack:skipWaiting') self.skipWaiting()
})

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/* ─── Web Push (unchanged) ───────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }

  const title = data.title || 'VitaTrack reminder'
  const options = {
    body: data.body || '',
    icon: data.icon || '/brand/icon.png',
    badge: '/brand/icon.png',
    tag: data.tag || 'vitatrack-reminder',
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    data: { url: data.url || '/dashboard/medications' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.navigate(url); return client.focus() }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
