// E2E: Settings page navigation
import { test, expect } from '../fixtures/electron'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss onboarding
    const overlay = page.locator('.onboarding-overlay')
    if (await overlay.isVisible({ timeout: 5_000 }).catch(() => false)) {
      for (let i = 0; i < 3; i++) {
        const btn = page.locator('.onboarding-primary-btn')
        if (await btn.isVisible().catch(() => false)) {
          await btn.click()
          await page.waitForTimeout(300)
        }
      }
    }
  })

  test('can navigate to settings page', async ({ page }) => {
    // Settings should be accessible via router
    await page.goto('http://localhost:5173/#/settings/appearance')
    await page.waitForTimeout(500)

    // Or via the sidebar settings icon — look for the settings layout
    const settingsLayout = page.locator('.settings-layout, [class*="settings"]')
    // If direct navigation works, we should see settings content
    await expect(settingsLayout.first()).toBeVisible({ timeout: 5_000 })
  })

  test('appearance settings shows theme options', async ({ page }) => {
    await page.goto('http://localhost:5173/#/settings/appearance')
    await page.waitForTimeout(1000)

    // Should show theme radio buttons (dark/light/system)
    const radioGroup = page.locator('.el-radio-group').first()
    await expect(radioGroup).toBeVisible({ timeout: 5_000 })
  })

  test('keybindings settings page loads', async ({ page }) => {
    await page.goto('http://localhost:5173/#/settings/keybindings')
    await page.waitForTimeout(1000)

    // Should show keybindings content
    const content = page.locator('[class*="keybinding"]')
    await expect(content.first()).toBeVisible({ timeout: 5_000 })
  })
})
