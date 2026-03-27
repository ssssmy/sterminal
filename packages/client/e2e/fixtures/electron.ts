// Electron test fixture — launches and cleans up the app for each test file
//
// Usage in spec files:
//   import { test, expect } from '../fixtures/electron'
//   test('my test', async ({ app, page }) => { ... })

import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import path from 'path'

// Build the app before tests (vite build + electron main/preload)
// This assumes `npm run build` has been run, or we run it in CI.
// For dev, we point to dist-electron which vite dev builds on the fly.

const CLIENT_ROOT = path.resolve(__dirname, '../..')

type TestFixtures = {
  app: ElectronApplication
  page: Page
}

export const test = base.extend<TestFixtures>({
  app: async ({}, use) => {
    const app = await electron.launch({
      args: [CLIENT_ROOT],
      cwd: CLIENT_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        // Use a separate test database to avoid polluting real data
        STERMINAL_TEST_MODE: '1',
      },
    })

    await use(app)

    // Cleanup
    await app.close()
  },

  page: async ({ app }, use) => {
    // Wait for the main window to appear
    const window = await app.firstWindow()
    // Wait for the app to finish loading
    await window.waitForLoadState('domcontentloaded')
    await use(window)
  },
})

export { expect }
