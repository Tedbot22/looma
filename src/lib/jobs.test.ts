import { describe, expect, it } from 'vitest'
import type { JobCount } from '../api/jobs'
import { describeJob, describeJobKind, describeWait, totalJobs } from './jobs'

const count = (kind: string, status: JobCount['status'], n: number): JobCount => ({ kind, status, n })

describe('totalJobs', () => {
  it('adds up each state across every kind', () => {
    const totals = totalJobs([
      count('push.customer', 'queued', 4),
      count('push.customer', 'running', 1),
      count('push.customer', 'succeeded', 30),
      count('push.customer', 'dead', 2),
      count('owner.orders_waiting', 'queued', 1),
      count('owner.orders_waiting', 'succeeded', 5),
    ])
    expect(totals).toEqual({ waiting: 5, running: 1, done: 35, gaveUp: 2 })
  })

  it('does not count cancelled jobs, and copes with nothing at all', () => {
    expect(totalJobs([count('push.customer', 'cancelled', 9)])).toEqual({ waiting: 0, running: 0, done: 0, gaveUp: 0 })
    expect(totalJobs([])).toEqual({ waiting: 0, running: 0, done: 0, gaveUp: 0 })
  })
})

describe('describeJob', () => {
  it('uses the specific name when there is one', () => {
    expect(describeJob('push.customer', 'cart_1')).toBe('Cart reminder (first)')
    expect(describeJob('push.customer', 'cart_2')).toBe('Cart reminder (second)')
    expect(describeJob('push.customer', 'inactive')).toBe('We miss you')
    expect(describeJob('push.customer', 'promo')).toBe('Promotion')
  })

  it('falls back to the general name, and then to the raw kind', () => {
    expect(describeJob('owner.orders_waiting', null)).toBe('Alerts to you about unconfirmed orders')
    expect(describeJob('push.customer', 'something_new')).toBe('Customer reminders and promotions')
    expect(describeJob('brand.new.kind', null)).toBe('brand.new.kind')
    expect(describeJobKind('push.customer')).toBe('Customer reminders and promotions')
  })
})

describe('describeWait', () => {
  it('says how long in plain words', () => {
    expect(describeWait(20)).toBe('less than a minute')
    expect(describeWait(60)).toBe('1 minute')
    expect(describeWait(15 * 60)).toBe('15 minutes')
    expect(describeWait(3600)).toBe('1 hour')
    expect(describeWait(3600 + 5 * 60)).toBe('1 hour 5 minutes')
    expect(describeWait(2 * 3600 + 60)).toBe('2 hours 1 minute')
  })
})
