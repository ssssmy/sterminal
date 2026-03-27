// E2E: Theme and layout verification
import { test, expect, dismissOnboarding } from '../fixtures/electron'

test.describe('Theme & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('app has data-theme attribute set', async ({ page }) => {
    const dataTheme = await page.locator('html').getAttribute('data-theme')
    // Default is 'system', which resolves to either 'dark' or 'light'
    expect(['dark', 'light']).toContain(dataTheme)
  })

  test('sidebar is visible in workspace', async ({ page }) => {
    const sidebar = page.locator('.app-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 5_000 })
  })

  test('toolbar is visible', async ({ page }) => {
    const toolbar = page.locator('.app-toolbar')
    await expect(toolbar).toBeVisible({ timeout: 5_000 })
  })

  test('terminal tabs bar is visible', async ({ page }) => {
    const tabsBar = page.locator('.terminal-tabs')
    await expect(tabsBar).toBeVisible({ timeout: 5_000 })
  })

  test('app uses correct accent color', async ({ page }) => {
    // The accent color should be set somewhere in CSS
    const accent = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return style.getPropertyValue('--accent').trim() ||
             style.getPropertyValue('--el-color-primary').trim()
    })
    // Should have some color value
    expect(accent.length).toBeGreaterThan(0)
  })
})
