// The reminder queue, as the owner sees it: how healthy it is, and what to do about reminders that gave up.
// (The queue itself is worked by the server. See supabase/migrations/20261127000000_job_queue.sql.)

import { supabase } from '../lib/supabase'
import { unwrap } from './db'

export interface JobCount {
  kind: string
  status: 'queued' | 'running' | 'succeeded' | 'dead' | 'cancelled'
  n: number
}

export interface DeadJob {
  id: number
  kind: string
  sub_kind: string | null // e.g. cart_1, promo
  attempts: number
  last_error: string | null
  finished_at: string
}

export interface JobOverview {
  enabled: boolean // is the queue switched on?
  counts: JobCount[]
  oldest_waiting_seconds: number | null // how long the longest-waiting due job has waited
  dead: DeadJob[] // the 20 latest that gave up
}

// Only the owner may ask: the database refuses anyone else.
export const fetchJobOverview = (): Promise<JobOverview> => unwrap<JobOverview>(supabase.rpc('admin_job_overview'))

// Gives a job that gave up another go, from the start.
export const requeueJob = (id: number): Promise<boolean> => unwrap<boolean>(supabase.rpc('admin_requeue_job', { p_id: id }))

// Takes a job that is waiting off the queue.
export const cancelJob = (id: number): Promise<boolean> => unwrap<boolean>(supabase.rpc('admin_cancel_job', { p_id: id }))
