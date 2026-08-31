import { defineConfig } from 'vitest/config'

// Deliberately does NOT extend vite.config.js. That config hard-fails when the
// Supabase env vars are missing — correct for a deployable build, but it would
// make the unit tests unrunnable in a clean checkout or in CI. Everything under
// test here is a pure function, so no Vite plugin is needed either.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
