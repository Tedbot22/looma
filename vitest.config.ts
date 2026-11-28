import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Test settings. Kept apart from vite.config.ts so the store's build settings stay untouched.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // component tests switch to jsdom with a comment at the top of the file
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
    restoreMocks: true,
  },
})
