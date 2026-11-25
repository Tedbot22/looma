// Calls one of our server functions (payments, delivery prices, notifications) and turns a failure into a
// readable message instead of a vague "non-2xx status code".

import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export async function callFunction<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? `Payment service error (${error.context.status}).`)
    }
    throw error
  }
  return data as T
}
