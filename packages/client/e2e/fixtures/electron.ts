// Electron test fixture — launches the compiled app for E2E testing
//
// PREREQUISITE: `vite build` must run before E2E tests (handled by test:e2e script).

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
    })
    await use(app)
    await app.close()
  },

  page: async ({ app }, use) => {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    // Give Vue + Pinia + DB restore time to fully mount
    await window.waitForTimeout(3000)
    await use(window)
  },
})

// Helper: dismiss onboarding wizard if visible
export async function dismissOnboarding(page: Page): Promise<void> {
  // Check if onboarding overlay exists
  const overlay = page.locator('.onboarding-overlay')
  const visible = await overlay.isVisible({ timeout: 2000 }).catch(() => false)
  if (!visible) return

  // Click through all steps (up to 4 clicks to be safe)
  for (let i = 0; i < 4; i++) {
    // Try the primary button first, then skip button
    const primaryBtn = page.locator('.onboarding-primary-btn')
    if (await primaryBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await primaryBtn.click()
      await page.waitForTimeout(500)
    }
    // Check if overlay is gone
    if (!(await overlay.isVisible().catch(() => false))) break
  }
}

// Helper: navigate via Vue Router
export async function navigateTo(page: Page, routePath: string): Promise<void> {
  await page.evaluate((p) => {
    const router = (window as any).__vue_router__
    if (router) router.push(p)
  }, routePath)
  await page.waitForTimeout(1000)
}

export { expect }
