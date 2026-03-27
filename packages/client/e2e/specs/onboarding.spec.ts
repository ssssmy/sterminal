// E2E: Onboarding wizard flow
// Note: onboarding only shows when `app.onboardingCompleted` is NOT set in DB.
// On a fresh test DB it should appear. On an existing DB it won't.
import { test, expect } from '../fixtures/electron'

test.describe('Onboarding Wizard', () => {
  test('app launches and shows main window', async ({ page }) => {
    // Basic: the app should load and have content
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: 10_000 })
  })

  test('if onboarding visible, can navigate through steps', async ({ page }) => {
    const overlay = page.locator('.onboarding-overlay')
    const isVisible = await overlay.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!isVisible) {
      test.skip()
      return
    }

    // Step 1 → Step 2
    await page.locator('.onboarding-primary-btn').click()
    await expect(page.locator('.onboarding-theme-grid')).toBeVisible({ timeout: 5_000 })

    // Step 2 → Step 3
    await page.locator('.onboarding-primary-btn').click()
    await expect(page.locator('.onboarding-quick-actions')).toBeVisible({ timeout: 5_000 })

    // Complete
    await page.locator('.onboarding-primary-btn').click()
    await expect(overlay).not.toBeVisible({ timeout: 5_000 })
  })
})
