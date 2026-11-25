// A stand-in for the Supabase client in tests. It records every query that is built (table, columns,
// filters) and answers with whatever the test says, so the api functions can be checked without a database.

export interface RecordedCall {
  kind: 'from' | 'rpc' | 'storage'
  target: string // the table, function or bucket name
  steps: [method: string, args: unknown[]][] // e.g. ['select', ['*']], ['order', ['sort_order']]
}

export interface Answer {
  data?: unknown
  error?: unknown
}

export type Responder = (call: RecordedCall) => Answer | undefined

// The steps of a call as plain text, for readable assertions: "select(*) > order(sort_order)".
export const describe = (call: RecordedCall) =>
  call.steps.map(([method, args]) => `${method}(${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(', ')})`).join(' > ')

export function fakeSupabase() {
  const calls: RecordedCall[] = []
  let respond: Responder = () => ({ data: [] })
  let storageFails = false
  let invoke: (name: string, options: { body?: unknown }) => Promise<{ data: unknown; error: unknown }> = async () => ({
    data: null,
    error: null,
  })

  const chainFor = (call: RecordedCall): unknown => {
    const chain: unknown = new Proxy(
      {},
      {
        get(_target, property) {
          // Awaiting the chain gives the answer, like the real client.
          if (property === 'then') {
            const answer = { data: null, error: null, ...(respond(call) ?? {}) }
            return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
              Promise.resolve(answer).then(resolve, reject)
          }
          return (...args: unknown[]) => {
            call.steps.push([String(property), args])
            return chain
          }
        },
      }
    )
    return chain
  }

  const record = (kind: RecordedCall['kind'], target: string, steps: RecordedCall['steps'] = []) => {
    const call: RecordedCall = { kind, target, steps }
    calls.push(call)
    return call
  }

  const client = {
    from: (table: string) => chainFor(record('from', table)),
    rpc: (name: string, args?: unknown) => chainFor(record('rpc', name, [['args', [args]]])),
    auth: {
      getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }),
    },
    functions: {
      invoke: (name: string, options: { body?: unknown }) => {
        record('rpc', `function:${name}`, [['body', [options.body]]])
        return invoke(name, options)
      },
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          record('storage', bucket, [['remove', [paths]]])
          return storageFails ? Promise.reject(new Error('storage is down')) : Promise.resolve({ error: null })
        },
      }),
    },
  }

  return {
    client,
    calls,
    respondWith: (next: Responder) => {
      respond = next
    },
    onInvoke: (handler: typeof invoke) => {
      invoke = handler
    },
    failStorage: () => {
      storageFails = true
    },
    reset: () => {
      calls.length = 0
      respond = () => ({ data: [] })
      storageFails = false
      invoke = async () => ({ data: null, error: null })
    },
  }
}

export type FakeSupabase = ReturnType<typeof fakeSupabase>
