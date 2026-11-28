// Plain-language wording and totals for the reminder queue, so the Health page stays simple.

import type { JobCount } from '../api/jobs'

export interface JobTotals {
  waiting: number
  running: number
  done: number
  gaveUp: number
}

// Adds up the counts by state (cancelled jobs are not counted anywhere).
export function totalJobs(counts: JobCount[]): JobTotals {
  const totals: JobTotals = { waiting: 0, running: 0, done: 0, gaveUp: 0 }
  for (const c of counts) {
    if (c.status === 'queued') totals.waiting += c.n
    else if (c.status === 'running') totals.running += c.n
    else if (c.status === 'succeeded') totals.done += c.n
    else if (c.status === 'dead') totals.gaveUp += c.n
  }
  return totals
}

const KIND_LABEL: Record<string, string> = {
  'push.customer': 'Customer reminders and promotions',
  'owner.orders_waiting': 'Alerts to you about unconfirmed orders',
}

const SUB_KIND_LABEL: Record<string, string> = {
  cart_1: 'Cart reminder (first)',
  cart_2: 'Cart reminder (second)',
  inactive: 'We miss you',
  promo: 'Promotion',
}

// "Cart reminder (first)", or the general name when the job has no more specific kind.
export function describeJob(kind: string, subKind: string | null): string {
  return (subKind && SUB_KIND_LABEL[subKind]) || KIND_LABEL[kind] || kind
}

export const describeJobKind = (kind: string): string => KIND_LABEL[kind] ?? kind

// "3 minutes", "1 hour 5 minutes": how long something has waited.
export function describeWait(seconds: number): string {
  if (seconds < 60) return 'less than a minute'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const h = `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  return rest === 0 ? h : `${h} ${rest} ${rest === 1 ? 'minute' : 'minutes'}`
}

// A reminder that has waited this long (in seconds) while the queue is on means nothing is working through it.
export const STUCK_AFTER_SECONDS = 15 * 60
