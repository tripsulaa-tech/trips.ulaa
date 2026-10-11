import { defineConfig } from 'vitest/config'

// Pure-logic tests only (no DOM), so they run fast and need no browser.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
