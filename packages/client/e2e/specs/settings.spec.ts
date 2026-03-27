// E2E: Settings page navigation
import { test, expect, dismissOnboarding, navigateTo } from '../fixtures/electron'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('can navigate to settings via hash', async ({ page }) => {
    await navigateTo(page, '/settings/appearance')

    // Should show settings content
    const content = page.locator('.settings-layout, [class*="settings"]')
    await expect(content.first()).toBeVisible({ timeout: 5_000 })
  })

  test('appearance settings has theme selector', async ({ page }) => {
    await navigateTo(page, '/settings/appearance')

    // Should have radio buttons or theme-related elements
    const themeSection = page.locator('.el-radio-group, [class*="theme"]').first()
    await expect(themeSection).toBeVisible({ timeout: 5_000 })
  })

  test('can navigate to keybindings settings', async ({ page }) => {
    await navigateTo(page, '/settings/keybindings')

    const content = page.locator('[class*="keybinding"]').first()
    await expect(content).toBeVisible({ timeout: 5_000 })
  })

  test('can navigate back to workspace', async ({ page }) => {
    await navigateTo(page, '/settings/appearance')
    await page.waitForTimeout(500)
    await navigateTo(page, '/')

    // Workspace elements should appear
    const workspace = page.locator('.terminal-tabs, .app-sidebar, .app-toolbar').first()
    await expect(workspace).toBeVisible({ timeout: 5_000 })
  })
})
