import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly and early if .env.local is missing or misnamed.
if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Check .env.local has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart `npm run dev`.'
  )
}

// One shared client for the whole app.
export const supabase = createClient(url, anonKey)
