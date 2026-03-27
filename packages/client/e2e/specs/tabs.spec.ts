// E2E: Terminal tab operations
import { test, expect } from '../fixtures/electron'

test.describe('Terminal Tabs', () => {
  // Skip onboarding first
  test.beforeEach(async ({ page }) => {
    // Wait for app load, dismiss onboarding if present
    const overlay = page.locator('.onboarding-overlay')
    if (await overlay.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Click through all 3 steps
      for (let i = 0; i < 3; i++) {
        const btn = page.locator('.onboarding-primary-btn')
        if (await btn.isVisible().catch(() => false)) {
          await btn.click()
          await page.waitForTimeout(300)
        }
      }
      await expect(overlay).not.toBeVisible({ timeout: 5_000 })
    }
  })

  test('has at least one tab', async ({ page }) => {
    const tabs = page.locator('.terminal-tabs__tab')
    await expect(tabs.first()).toBeVisible({ timeout: 5_000 })
  })

  test('new tab button creates a tab', async ({ page }) => {
    const tabsBefore = await page.locator('.terminal-tabs__tab').count()
    await page.locator('.terminal-tabs__new-btn').click()
    await page.waitForTimeout(500)
    const tabsAfter = await page.locator('.terminal-tabs__tab').count()
    expect(tabsAfter).toBe(tabsBefore + 1)
  })

  test('clicking a tab switches to it', async ({ page }) => {
    // Create a second tab
    await page.locator('.terminal-tabs__new-btn').click()
    await page.waitForTimeout(300)

    // Click first tab
    const firstTab = page.locator('.terminal-tabs__tab').first()
    await firstTab.click()
    await expect(firstTab).toHaveClass(/terminal-tabs__tab--active/)
  })

  test('close button removes a tab', async ({ page }) => {
    // Create a second tab so we have 2
    await page.locator('.terminal-tabs__new-btn').click()
    await page.waitForTimeout(300)
    const tabsBefore = await page.locator('.terminal-tabs__tab').count()

    // Close the last tab
    const lastTab = page.locator('.terminal-tabs__tab').last()
    const closeBtn = lastTab.locator('.terminal-tabs__close')
    await closeBtn.click()
    await page.waitForTimeout(300)

    const tabsAfter = await page.locator('.terminal-tabs__tab').count()
    expect(tabsAfter).toBe(tabsBefore - 1)
  })

  test('right-click shows context menu', async ({ page }) => {
    const firstTab = page.locator('.terminal-tabs__tab').first()
    await firstTab.click({ button: 'right' })

    const ctxMenu = page.locator('.terminal-tabs__ctx-menu')
    await expect(ctxMenu).toBeVisible({ timeout: 3_000 })

    // Should have menu items
    const items = ctxMenu.locator('.terminal-tabs__ctx-item')
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(4) // restart, duplicate, pin, close, close right
  })

  test('context menu: duplicate creates a copy', async ({ page }) => {
    const tabsBefore = await page.locator('.terminal-tabs__tab').count()

    const firstTab = page.locator('.terminal-tabs__tab').first()
    await firstTab.click({ button: 'right' })

    const duplicateItem = page.locator('.terminal-tabs__ctx-item').filter({ hasText: /复制|Duplicate/ })
    await duplicateItem.click()
    await page.waitForTimeout(500)

    const tabsAfter = await page.locator('.terminal-tabs__tab').count()
    expect(tabsAfter).toBe(tabsBefore + 1)
  })

  test('context menu: pin shows star icon', async ({ page }) => {
    const firstTab = page.locator('.terminal-tabs__tab').first()
    await firstTab.click({ button: 'right' })

    const pinItem = page.locator('.terminal-tabs__ctx-item').filter({ hasText: /固定|Pin/ })
    await pinItem.click()
    await page.waitForTimeout(300)

    // Pin icon should appear
    const pinIcon = page.locator('.terminal-tabs__tab').first().locator('.terminal-tabs__pin')
    await expect(pinIcon).toBeVisible()
  })

  test('double-click enables inline rename', async ({ page }) => {
    const firstTab = page.locator('.terminal-tabs__tab').first()
    await firstTab.dblclick()

    const renameInput = page.locator('.terminal-tabs__rename-input')
    await expect(renameInput).toBeVisible()
  })
})
