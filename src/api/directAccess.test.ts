// A guard that keeps the data layer honest.
//
// The rule: screens, hooks and helpers do not talk to the database themselves. They call a function from
// src/api. This test finds every file that still reaches for `supabase.from(...)`, `.rpc(...)`,
// `.functions` or `.storage` directly, and compares it with directAccessAllowlist.txt, the files that have
// not been moved over yet.
//
//  * A file that is NOT on the list and talks to the database fails the test: put the query in src/api.
//  * A file that IS on the list but no longer does fails the test too: delete its line from the list.
//
// So the list can only get shorter. Login (supabase.auth) and live updates (supabase.channel) are allowed.

import { describe, expect, it } from 'vitest'
import allowlistText from './directAccessAllowlist.txt?raw'

const sources = import.meta.glob(
  ['/src/**/*.ts', '/src/**/*.tsx', '!/src/api/**', '!/src/test/**', '!/src/**/*.test.ts', '!/src/**/*.test.tsx', '!/src/lib/supabase.ts'],
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>

const DIRECT = /\bsupabase\s*\.\s*(from|rpc|functions|storage)\b/

// Comments may mention the old way of querying; only real code counts.
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const violators = Object.entries(sources)
  .filter(([, code]) => DIRECT.test(withoutComments(code)))
  .map(([path]) => path.replace(/^\//, ''))
  .sort()

const allowlist = allowlistText
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

describe('data layer boundary', () => {
  it('has no new file that queries the database directly', () => {
    const fresh = violators.filter((file) => !allowlist.includes(file))
    expect(fresh, `Move these queries into src/api and call them from there:\n  ${fresh.join('\n  ')}`).toEqual([])
  })

  it('has no stale entries on the allowlist (remove files once they are migrated)', () => {
    const stale = allowlist.filter((file) => !violators.includes(file))
    expect(stale, `These no longer query the database directly. Delete them from directAccessAllowlist.txt:\n  ${stale.join('\n  ')}`).toEqual([])
  })

  it('keeps the allowlist sorted and free of duplicates', () => {
    expect(allowlist).toEqual([...new Set(allowlist)].sort())
  })
})
