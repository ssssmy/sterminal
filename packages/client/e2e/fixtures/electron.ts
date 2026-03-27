// Electron test fixture — launches the compiled app for E2E testing
//
// PREREQUISITE: Run `npm run build` before running E2E tests.
// The fixture launches Electron from dist-electron/main/index.js.

import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import path from 'path'

const CLIENT_ROOT = path.resolve(__dirname, '../..')
const MAIN_ENTRY = path.join(CLIENT_ROOT, 'dist-electron/main/index.js')

type TestFixtures = {
  app: ElectronApplication
  page: Page
}

export const test = base.extend<TestFixtures>({
  app: async ({}, use) => {
    const app = await electron.launch({
      args: [MAIN_ENTRY],
      cwd: CLIENT_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })

    await use(app)
    await app.close()
  },

  page: async ({ app }, use) => {
    const window = await app.firstWindow()
    // Wait for Vue app to mount
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000) // give Vue + stores time to initialize
    await use(window)
  },
})

// Helper: navigate via Vue Router (can't use page.goto in Electron)
export async function navigateTo(page: Page, routePath: string): Promise<void> {
  await page.evaluate((path) => {
    const router = (window as any).__vue_router__
    if (router) {
      router.push(path)
    } else {
      // Fallback: manipulate hash directly
      window.location.hash = '#' + path
    }
  }, routePath)
  await page.waitForTimeout(500)
}

// Helper: dismiss onboarding wizard if visible
export async function dismissOnboarding(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const btn = page.locator('.onboarding-primary-btn')
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(400)
    } else {
      break
    }
  }
}

export { expect }
