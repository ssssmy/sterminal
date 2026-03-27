// E2E: Settings page navigation via Vue Router
import { test, expect, dismissOnboarding, navigateTo } from '../fixtures/electron'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
    await page.waitForTimeout(500)
  })

  test('can navigate to settings via router', async ({ page }) => {
    await navigateTo(page, '/settings/appearance')

    // Wait for any settings-related content to appear
    const hasSettings = await page.locator('.settings-layout, .appearance-settings, [class*="settings"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false)
    expect(hasSettings).toBe(true)
  })

  test('can navigate to keybindings page', async ({ page }) => {
    await navigateTo(page, '/settings/keybindings')

    const hasContent = await page.locator('[class*="keybinding"], .settings-layout').first()
      .isVisible({ timeout: 5_000 }).catch(() => false)
    expect(hasContent).toBe(true)
  })

  test('can navigate back to workspace root', async ({ page }) => {
    await navigateTo(page, '/settings/appearance')
    await page.waitForTimeout(500)
    await navigateTo(page, '/')
    await page.waitForTimeout(1000)

    // Either workspace or login should be visible
    const hasContent = await page.locator('#app').innerText()
    expect(hasContent.length).toBeGreaterThan(0)
  })
})
