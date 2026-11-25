// Store-wide settings the owner can change without a new release: contact details, delivery pricing,
// voucher rules, referral rules. They live in the app_settings table as simple key/value text.

import { supabase } from '../lib/supabase'
import { run, unwrap } from './db'

export interface Setting {
  key: string
  value: string
}

// Every setting as { key: value }.
export async function fetchAppSettings(): Promise<Record<string, string>> {
  const rows = await unwrap<Setting[]>(supabase.from('app_settings').select('key, value'))
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// Saves settings, creating any that don't exist yet and replacing the ones that do.
export const saveAppSettings = (rows: Setting[]) =>
  run(supabase.from('app_settings').upsert(rows, { onConflict: 'key' }))

// Changes settings that already exist. Every change is attempted; if any failed, the first problem is thrown.
export async function updateAppSettings(values: Record<string, string>): Promise<void> {
  const results = await Promise.all(
    Object.entries(values).map(([key, value]) => supabase.from('app_settings').update({ value }).eq('key', key))
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
