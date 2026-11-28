# The reminder queue

Cart reminders, "we miss you" messages, promotions and the alert that tells you an order is waiting all go through
a **queue** in the database. This page explains how it works, how to switch it on, and what to do when a reminder
does not arrive.

## Why a queue

The old sender did everything in one pass every 5 minutes. If a reminder failed it was simply tried again at the next
pass, with no pause, no limit and no record of why. If a pass stopped halfway, whole groups could be left unsent.

With the queue:

- Every reminder is its own **job**, queued once and never twice (each job has a permanent unique key).
- A worker takes jobs safely: two workers can never take the same one, so overlapping runs are harmless.
- A job that fails is retried after a growing pause (30 seconds, 1 minute, 2, 4, 8 ... never more than an hour).
- After 5 tries a job **gives up** and appears on **Admin > Reminders** with the reason, and a **Try again** button.
- If a worker dies halfway, its job is picked up again automatically once its time runs out.
- Just before sending, the worker checks the reminder is still worth sending. A customer who checked out while it
  waited is not told their cart is waiting.

```
every run of the timer
   |
   v
plan_all()  ------------>  jobs table   <------------  claim_jobs()  (SKIP LOCKED: one worker per job)
 (SQL: who should be                                          |
  reminded? one job each)                                     v
                                                  send -> done / retry later / give up
```

## Turning it on

It is **off by default**, and nothing changes until you switch it on. You can switch it back at any time.

1. Run `supabase/migrations/20261127000000_job_queue.sql` in the Supabase SQL Editor.
2. Deploy the updated function: `npx supabase functions deploy push-scheduler --no-verify-jwt`
3. Optional but recommended: make the timer run every minute instead of every 5, so retries and "Send now" are
   quicker. This is safe because overlapping runs cannot send anything twice:

   ```sql
   select cron.alter_job(
     (select jobid from cron.job where jobname = 'looma-push-scheduler'),
     schedule := '* * * * *'
   );
   ```
4. Open **Admin > Reminders** and press **Turn on**. (Or run
   `update public.push_settings set queue_enabled = true where id = 1;`)

Switch it on when no promotion is partway through sending.

## Checking it works

- **Admin > Reminders** shows what is waiting, what is sending, what is done, and what gave up.
- After a few minutes with a customer who has an abandoned cart, you should see the "Done" number rise.
- If "waiting" numbers climb and nothing is sent, the timer is not running. The page warns you after 15 minutes.

## When a reminder does not arrive

Open **Admin > Reminders > Reminders that gave up**. The reason is the push service's own words:

| Reason | What it means | What to do |
| --- | --- | --- |
| `401` or `403` | The push keys on the server do not match | Check `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in the function's secrets, then **Try again** |
| `429` | The push service asked us to slow down | Usually clears by itself; **Try again** later |
| `5xx` | The push service was down | **Try again** |
| `Nothing reached the owner` | No alert device is saved for you and no email is set | Turn on alerts on this device (Admin > Notifications), or set `OWNER_EMAIL` |

A customer who has uninstalled the app or switched notifications off is not a failure: that device is removed
quietly and the reminder is marked done as "no device".

## Switching back

Press **Switch back** on the same page. The old sender takes over immediately. Reminders still waiting in the queue
are not sent while it is off, and they are picked up again if you switch the queue back on.

## Changing the numbers

| What | Where |
| --- | --- |
| How soon, how often, quiet hours, the weekly promotion limit | Admin > Notifications (as before) |
| How many tries before giving up (5) and the first pause (30 seconds) | `max_attempts` default and `job_backoff()` in `20261127000000_job_queue.sql` |
| How long a worker may hold a job before it is taken back (2 minutes) | `leaseSeconds` in `supabase/functions/_shared/jobRunner.ts` |
| The wording of each reminder | `supabase/functions/_shared/pushJobs.ts` |

## Good to know

- A reminder is sent first and noted in the log second. If a worker dies between the two, the customer may get the
  same reminder twice, never zero times. Both carry the same tag, so the phone replaces the first with the second.
- Finished jobs are tidied away after a week (given-up ones after a month).
- The tests for all of this run on every push (the `database` job in `.github/workflows/ci.yml`) and locally with
  `DATABASE_URL=postgres://... npm run test:db`.
- Once you are happy with the queue (a couple of weeks), the old sending code in `push-scheduler/index.ts` can be removed.
