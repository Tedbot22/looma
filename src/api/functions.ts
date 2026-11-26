// Calls one of our server functions (payments, delivery prices, notifications) and turns a failure into a
// readable message instead of a vague "non-2xx status code".

import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// `unavailable` words the message shown when the server gave no explanation of its own.
export async function callFunction<T>(
  name: string,
  body: object,
  unavailable: (status: number) => string = (status) => `Payment service error (${status}).`
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? unavailable(error.context.status))
    }
    throw error
  }
  return data as T
}

// Like callFunction, but for the owner's notification tools: when the server refuses, the whole reply
// ("401: <what the server said>") is shown, because the exact wording is what helps find the cause.
export async function callFunctionWithDetails<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const text = await error.context.text().catch(() => '')
      throw new Error(`${error.context.status}: ${text || 'no details'}`)
    }
    throw error
  }
  return data as T
}
