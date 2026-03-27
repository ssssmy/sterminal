import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    // Main process integration tests need node environment (for better-sqlite3)
    environmentMatchGlobs: [
      ['src/main/**/*.test.ts', 'node'],
    ],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/shared/**', 'src/renderer/services/**', 'src/renderer/composables/**', 'src/main/services/**'],
    },
  },
})
