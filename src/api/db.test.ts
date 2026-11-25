import { describe, expect, it } from 'vitest'
import { errorCode, errorMessage, run, unwrap } from './db'

const answer = <T>(data: T | null, error: { message: string; code?: string } | null = null) =>
  Promise.resolve({ data, error }) as never

describe('unwrap', () => {
  it('returns the data when the database is happy', async () => {
    await expect(unwrap(answer([1, 2, 3]))).resolves.toEqual([1, 2, 3])
  })

  it('returns null for "nothing found" (maybeSingle)', async () => {
    await expect(unwrap(answer(null))).resolves.toBeNull()
  })

  it('throws the database error, keeping its code', async () => {
    await expect(unwrap(answer(null, { message: 'nope', code: '42501' }))).rejects.toMatchObject({ message: 'nope', code: '42501' })
  })
})

describe('run', () => {
  it('finishes quietly on success and throws on failure', async () => {
    await expect(run(Promise.resolve({ error: null }))).resolves.toBeUndefined()
    await expect(run(Promise.resolve({ error: { message: 'bad', code: '23505' } as never }))).rejects.toMatchObject({ code: '23505' })
  })
})

describe('errorMessage / errorCode', () => {
  it('reads a message from Error objects and from Supabase-style plain objects', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage({ message: 'from the database', code: '23503' })).toBe('from the database')
  })

  it('falls back to a friendly line when there is no message', () => {
    expect(errorMessage(null)).toBe('Something went wrong.')
    expect(errorMessage({})).toBe('Something went wrong.')
    expect(errorMessage('just text')).toBe('Something went wrong.')
  })

  it('reads the error code when there is one', () => {
    expect(errorCode({ code: '23503' })).toBe('23503')
    expect(errorCode(new Error('x'))).toBeUndefined()
    expect(errorCode(null)).toBeUndefined()
  })
})
