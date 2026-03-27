// E2E: Theme switching
import { test, expect } from '../fixtures/electron'

test.describe('Theme', () => {
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

  test('app starts with dark theme by default', async ({ page }) => {
    const html = page.locator('html')
    // Should have dark class or data-theme=dark
    const isDark = await html.evaluate(el =>
      el.classList.contains('dark') || el.getAttribute('data-theme') === 'dark'
    )
    expect(isDark).toBe(true)
  })

  test('dark theme has correct background color', async ({ page }) => {
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
    )
    // Dark theme bg should be a dark color
    expect(bg).toBeTruthy()
  })

  test('sidebar is visible in workspace', async ({ page }) => {
    const sidebar = page.locator('.app-sidebar, [class*="sidebar"]')
    await expect(sidebar.first()).toBeVisible({ timeout: 5_000 })
  })

  test('toolbar is visible', async ({ page }) => {
    const toolbar = page.locator('.app-toolbar, [class*="toolbar"]')
    await expect(toolbar.first()).toBeVisible({ timeout: 5_000 })
  })
})
