/**
 * Vitest setup: a minimal in-memory IndexedDB implementing exactly the surface
 * src/lib/dataStore uses (open/upgrade, add/getAll/get/put/delete/clear,
 * transaction + oncomplete, objectStoreNames.contains, deleteDatabase). Plus
 * helpers to toggle online/offline. Not a spec-complete IDB — just enough to run
 * the real data-layer logic deterministically.
 */

class FakeRequest {
  result: any = undefined
  error: any = null
  onsuccess: ((e?: any) => void) | null = null
  onerror: ((e?: any) => void) | null = null
  onupgradeneeded: ((e?: any) => void) | null = null
}

function fire(r: FakeRequest) {
  setTimeout(() => { if (r.onsuccess) r.onsuccess({ target: r }) }, 0)
}

class Store {
  data = new Map<any, any>()
  seq = 1
  constructor(public keyPath: string, public autoIncrement: boolean) {}
  add(v: any) {
    const r = new FakeRequest()
    let key = v[this.keyPath]
    if (key == null && this.autoIncrement) { key = this.seq++; v = { ...v, [this.keyPath]: key } }
    this.data.set(key, v); r.result = key; fire(r); return r
  }
  put(v: any) { const r = new FakeRequest(); this.data.set(v[this.keyPath], v); r.result = v[this.keyPath]; fire(r); return r }
  get(key: any) { const r = new FakeRequest(); r.result = this.data.get(key); fire(r); return r }
  getAll() { const r = new FakeRequest(); r.result = [...this.data.values()]; fire(r); return r }
  delete(key: any) { const r = new FakeRequest(); this.data.delete(key); fire(r); return r }
  clear() { const r = new FakeRequest(); this.data.clear(); fire(r); return r }
}

class FakeTx {
  oncomplete: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public db: FakeDB) { setTimeout(() => { if (this.oncomplete) this.oncomplete() }, 0) }
  objectStore(name: string) { return this.db.stores.get(name)! }
}

class FakeDB {
  stores = new Map<string, Store>()
  version = 0
  get objectStoreNames() { const s = this.stores; return { contains: (n: string) => s.has(n) } }
  createObjectStore(name: string, opts?: { keyPath?: string; autoIncrement?: boolean }) {
    const st = new Store(opts?.keyPath ?? 'id', !!opts?.autoIncrement)
    this.stores.set(name, st); return st
  }
  transaction(_names: any, _mode?: string) { return new FakeTx(this) }
  close() {}
}

const DBS = new Map<string, FakeDB>()

const fakeIndexedDB = {
  open(name: string, version?: number) {
    const req = new FakeRequest()
    let db = DBS.get(name)
    const isNew = !db
    if (isNew) { db = new FakeDB(); DBS.set(name, db) }
    const needUpgrade = isNew || (!!version && version > (db as FakeDB).version)
    req.result = db
    setTimeout(() => {
      if (needUpgrade) { (db as FakeDB).version = version || (db as FakeDB).version || 1; if (req.onupgradeneeded) req.onupgradeneeded({ target: req }) }
      if (req.onsuccess) req.onsuccess({ target: req })
    }, 0)
    return req
  },
  deleteDatabase(name: string) { const req = new FakeRequest(); DBS.delete(name); fire(req); return req },
}

;(globalThis as any).indexedDB = fakeIndexedDB

;(globalThis as any).__resetIDB = () => { DBS.clear() }
;(globalThis as any).__setOnline = (v: boolean) => {
  Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: v })
}

// Ensure crypto.randomUUID exists (node 20 provides it; guard just in case).
if (!globalThis.crypto?.randomUUID) {
  ;(globalThis as any).crypto = { ...(globalThis.crypto ?? {}), randomUUID: () => 'uuid-' + Math.random().toString(16).slice(2) }
}

export {}
