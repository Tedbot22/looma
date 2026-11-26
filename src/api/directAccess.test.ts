// A guard that keeps the data layer honest.
//
// The rule: screens, hooks and helpers never talk to the database themselves. They call a function from
// src/api. This test fails if any file outside src/api reaches for `supabase.from(...)`, `.rpc(...)`,
// `.functions` or `.storage` directly, and names the file so it can be fixed.
//
// Login (supabase.auth) and live updates (supabase.channel) are allowed anywhere.
// There are no exceptions: every database call lives in src/api, where it can be tested.

import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(
  ['/src/**/*.ts', '/src/**/*.tsx', '!/src/api/**', '!/src/test/**', '!/src/**/*.test.ts', '!/src/**/*.test.tsx', '!/src/lib/supabase.ts'],
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>

const DIRECT = /\bsupabase\s*\.\s*(from|rpc|functions|storage)\b/

// Comments may mention the old way of querying; only real code counts.
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('data layer boundary', () => {
  it('scans the source files (so an empty result means "clean", not "found nothing")', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
  })

  it('has no file outside src/api that queries the database directly', () => {
    const violators = Object.entries(sources)
      .filter(([, code]) => DIRECT.test(withoutComments(code)))
      .map(([path]) => path.replace(/^\//, ''))
      .sort()
    expect(violators, `Move these queries into src/api and call them from there:\n  ${violators.join('\n  ')}`).toEqual([])
  })

  it('does recognise a direct query when one is written (the check itself works)', () => {
    expect(DIRECT.test(withoutComments("await supabase\n  .from('orders').select('*')"))).toBe(true)
    expect(DIRECT.test(withoutComments("supabase.rpc('place_order')"))).toBe(true)
    expect(DIRECT.test(withoutComments("supabase.storage.from('x')"))).toBe(true)
    expect(DIRECT.test(withoutComments("// supabase.from('orders') used to be here"))).toBe(false)
    expect(DIRECT.test(withoutComments("supabase.auth.getUser()"))).toBe(false)
  })
})
