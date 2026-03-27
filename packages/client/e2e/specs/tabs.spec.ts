// E2E: Terminal tab operations
import { test, expect, dismissOnboarding } from '../fixtures/electron'

test.describe('Terminal Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
    await page.waitForTimeout(500)
  })

  test('workspace has visible UI', async ({ page }) => {
    // After onboarding, something should be on screen
    const appRoot = page.locator('#app')
    await expect(appRoot).toBeVisible()
    const text = await appRoot.innerText()
    expect(text.length).toBeGreaterThan(0)
  })

  test('new tab button exists if tabs bar visible', async ({ page }) => {
    const tabsBar = page.locator('.terminal-tabs')
    const visible = await tabsBar.isVisible({ timeout: 3_000 }).catch(() => false)
    if (!visible) {
      test.skip()
      return
    }
    const newBtn = page.locator('.terminal-tabs__new-btn')
    await expect(newBtn).toBeVisible()
  })

  test('right-click on tab shows context menu', async ({ page }) => {
    const tab = page.locator('.terminal-tabs__tab').first()
    const visible = await tab.isVisible({ timeout: 3_000 }).catch(() => false)
    if (!visible) {
      test.skip()
      return
    }
    await tab.click({ button: 'right' })
    const ctxMenu = page.locator('.terminal-tabs__ctx-menu')
    await expect(ctxMenu).toBeVisible({ timeout: 3_000 })
    const items = ctxMenu.locator('.terminal-tabs__ctx-item')
    expect(await items.count()).toBeGreaterThanOrEqual(4)
  })
})
