# Looma

An online thrift store: React 19 + TypeScript + Vite on the front, Supabase (database, login, edge functions) behind it, Paystack for payments, hosted on Vercel.

## Run it on your computer

```bash
nvm use            # Node 22 (see .nvmrc)
npm ci
cp .env.example .env.local   # then fill in the values below
npm run dev
```

`.env.local` needs:

| Name | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project address |
| `VITE_SUPABASE_ANON_KEY` | The project's public (anon) key |
| `VITE_SITE_URL` | Optional. The store's public address, used for sharing and Google. Vercel fills it in by itself. |

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the store with live reload |
| `npm test` | Runs the automated tests (`npm run test:watch` re-runs them as you edit) |
| `npm run lint` | Checks the code for common mistakes |
| `npm run build` | Checks the types, then builds the store for publishing |

Every push and pull request on GitHub runs lint, the tests and the build (see `.github/workflows/ci.yml`). Please keep it green before publishing.

## Where things live

| Folder | What is in it |
| --- | --- |
| `src/pages` | One file per page (shop, product, checkout, admin pages...) |
| `src/components` | Pieces shared between pages (cards, header, dialogs, error screens) |
| `src/api` | The only place that talks to the database, the payment and delivery server functions, and file storage. One file per area (catalogue, orders, cart, reviews...). Screens call these functions; they never build queries themselves. A test fails if a file outside `src/api` does. |
| `src/hooks`, `src/context` | Shared behaviour: cart, wishlist, login, search suggestions |
| `src/lib` | Plain logic with no screen: search ranking, coupons, deal ordering, formatting. Most tests are here. |
| `supabase/migrations` | The database, as numbered SQL files. Run them in order. Every database change belongs here. |
| `supabase/functions` | Edge functions: payments, refunds, notifications, support chat, the push scheduler |

## Adding or changing data access

1. Put the query in the right file in `src/api` (or add a new one), as a small function with a clear name.
2. Add its cache key to `src/api/queryKeys.ts`, so every screen shares one spelling of it.
3. Add a test next to it: `src/test/fakeSupabase.ts` records the table, columns and filters a function uses, so a typo in a query fails a test instead of the live store.

## Changing the database

1. Write the change as the next numbered file in `supabase/migrations` (for example `0006_...sql`).
2. Make it safe to run twice (`if not exists`, `create or replace`).
3. Try it on a Supabase branch or a copy of the project first, then on the live one.

Functions that only the server should run (payments, cancelling, push candidates) are locked to the service role. New functions are private by default; grant access on purpose, only to what needs it.

## When something breaks on the live store

Pages are wrapped in error boundaries, so a crash shows a "Something went wrong" message with the header and footer still in place instead of a blank page. Errors are collected in `src/lib/errorReporting.ts`; today they go to the browser console. To send them to a service such as Sentry, call `setErrorReporter(...)` once in `src/main.tsx`.
