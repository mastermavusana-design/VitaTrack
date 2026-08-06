/**
 * Stand-in for @supabase/auth-helpers-nextjs used only in vitest (aliased in
 * vitest.config.ts). The query builder records each call on globalThis.__calls
 * and returns whatever globalThis.__handler decides, so tests can assert what the
 * data layer sent and simulate RLS/constraint errors.
 */

type QueryState = {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  payload?: any
  match?: any
  onConflict?: string
}

declare global {
  // eslint-disable-next-line no-var
  var __handler: ((s: QueryState) => { data: any; error: any }) | undefined
  // eslint-disable-next-line no-var
  var __calls: QueryState[] | undefined
  // eslint-disable-next-line no-var
  var __session: { data: { session: any } } | undefined
}

function defaultHandler(s: QueryState) {
  if (s.op === 'select') return { data: [], error: null }
  return { data: s.payload ?? null, error: null }
}

function builder(table: string) {
  const state: QueryState = { table, op: 'select' }
  const run = () => {
    ;(globalThis.__calls ??= []).push({ ...state })
    return Promise.resolve((globalThis.__handler ?? defaultHandler)(state))
  }
  const b: any = {
    insert(r: any) { state.op = 'insert'; state.payload = r; return b },
    upsert(r: any, o?: any) { state.op = 'upsert'; state.payload = r; state.onConflict = o?.onConflict; return b },
    update(p: any) { state.op = 'update'; state.payload = p; return b },
    delete() { state.op = 'delete'; return b },
    select() { return b },
    match(m: any) { state.match = m; return b },
    eq() { return b },
    gte() { return b },
    in() { return b },
    order() { return b },
    limit() { return b },
    single() { return run() },
    maybeSingle() { return run() },
    then(res: any, rej: any) { return run().then(res, rej) },
  }
  return b
}

export function createClientComponentClient() {
  return {
    auth: {
      getSession: async () =>
        globalThis.__session ?? { data: { session: { user: { id: 'user-self', email: 'me@example.com' } } } },
    },
    from: (table: string) => builder(table),
  }
}

export {}
