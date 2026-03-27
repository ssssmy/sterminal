// E2E: Theme and layout verification
import { test, expect, dismissOnboarding } from '../fixtures/electron'

test.describe('Theme & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
    await page.waitForTimeout(500)
  })

  test('app has data-theme attribute set', async ({ page }) => {
    const dataTheme = await page.locator('html').getAttribute('data-theme')
    expect(dataTheme).not.toBeNull()
    expect(['dark', 'light']).toContain(dataTheme)
  })

  test('body has content', async ({ page }) => {
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('app root element exists', async ({ page }) => {
    const appRoot = page.locator('#app')
    await expect(appRoot).toBeVisible({ timeout: 5_000 })
  })

  test('workspace or login page is shown', async ({ page }) => {
    // After dismissing onboarding, either workspace (sidebar/tabs) or login page should be visible
    const hasSidebar = await page.locator('.app-sidebar').isVisible().catch(() => false)
    const hasLogin = await page.locator('[class*="login"]').isVisible().catch(() => false)
    expect(hasSidebar || hasLogin).toBe(true)
  })
})
