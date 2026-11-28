import { defineConfig } from 'vitest/config'

// Tests that need a real Postgres (the job queue's SQL). They are skipped unless DATABASE_URL is set.
// Run with:  DATABASE_URL=postgres://... npm run test:db   (CI starts a Postgres and does this for you)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.db.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false, // the tests share one database
  },
})
