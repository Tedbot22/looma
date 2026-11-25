// Small helpers shared by everything in src/api. They turn Supabase's "{ data, error }" answers into the
// usual "return the data, or throw the error", so each query reads as one line and failures are never ignored.

import type { PostgrestError } from '@supabase/supabase-js'

interface Answer<T> {
  data: T | null
  error: PostgrestError | null
}

// Returns the rows (or the one row) a query found. Throws if the database reported a problem.
export async function unwrap<T>(query: PromiseLike<Answer<T>>): Promise<T> {
  const { data, error } = await query
  if (error) throw error
  return data as T
}

// For changes (insert, update, delete) where nothing needs to come back. Throws if it failed.
export async function run(query: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
  const { error } = await query
  if (error) throw error
}

// A readable message from anything that was thrown (Supabase errors are plain objects, not Error instances).
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  const message = (err as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : 'Something went wrong.'
}

// The database's error code, such as '23503' (still referenced elsewhere) or '23505' (already exists).
export const errorCode = (err: unknown): string | undefined => (err as { code?: string } | null)?.code

// For small counters (like a badge on a menu item): a count that couldn't be read shows as 0 rather than
// breaking the page it sits on.
export async function countOf(query: PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await query
  return count ?? 0
}
