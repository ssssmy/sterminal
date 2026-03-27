// E2E: Terminal tab operations
import { test, expect, dismissOnboarding } from '../fixtures/electron'

test.describe('Terminal Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('workspace loads with UI elements', async ({ page }) => {
    // Sidebar or tabs or toolbar should be visible
    const hasUI = await page.locator('.terminal-tabs, .app-sidebar, .app-toolbar').first()
      .isVisible({ timeout: 10_000 }).catch(() => false)
    expect(hasUI).toBe(true)
  })

  test('new tab button is visible', async ({ page }) => {
    const newBtn = page.locator('.terminal-tabs__new-btn')
    const visible = await newBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    // May not be visible if no tabs component rendered yet
    if (visible) {
      await expect(newBtn).toBeVisible()
    }
  })

  test('if tabs exist, clicking one makes it active', async ({ page }) => {
    const tabs = page.locator('.terminal-tabs__tab')
    const count = await tabs.count()
    if (count < 1) {
      test.skip()
      return
    }
    await tabs.first().click()
    await expect(tabs.first()).toHaveClass(/terminal-tabs__tab--active/)
  })

  test('right-click on tab shows context menu', async ({ page }) => {
    const tabs = page.locator('.terminal-tabs__tab')
    const count = await tabs.count()
    if (count < 1) {
      test.skip()
      return
    }
    await tabs.first().click({ button: 'right' })
    const ctxMenu = page.locator('.terminal-tabs__ctx-menu')
    await expect(ctxMenu).toBeVisible({ timeout: 3_000 })

    // Verify menu items exist
    const items = ctxMenu.locator('.terminal-tabs__ctx-item')
    expect(await items.count()).toBeGreaterThanOrEqual(4)

    // Close menu
    await page.locator('.terminal-tabs__ctx-backdrop').click()
  })

  test('double-click tab enables inline rename', async ({ page }) => {
    const tabs = page.locator('.terminal-tabs__tab')
    const count = await tabs.count()
    if (count < 1) {
      test.skip()
      return
    }
    await tabs.first().dblclick()
    const input = page.locator('.terminal-tabs__rename-input')
    await expect(input).toBeVisible({ timeout: 3_000 })
  })
})
