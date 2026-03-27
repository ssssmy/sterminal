// E2E: Onboarding wizard flow
import { test, expect } from '../fixtures/electron'

test.describe('Onboarding Wizard', () => {
  test('shows welcome step on first launch', async ({ page }) => {
    // The onboarding overlay should be visible
    const overlay = page.locator('.onboarding-overlay')
    await expect(overlay).toBeVisible({ timeout: 10_000 })

    // Step 1: Welcome title
    const title = page.locator('.onboarding-step__title')
    await expect(title).toBeVisible()
  })

  test('can navigate to step 2 (theme)', async ({ page }) => {
    const overlay = page.locator('.onboarding-overlay')
    await expect(overlay).toBeVisible({ timeout: 10_000 })

    // Click "Next" button
    const nextBtn = page.locator('.onboarding-primary-btn')
    await nextBtn.click()

    // Step 2 should show theme selection
    await expect(page.locator('.onboarding-theme-grid')).toBeVisible()
  })

  test('can select a theme in step 2', async ({ page }) => {
    await expect(page.locator('.onboarding-overlay')).toBeVisible({ timeout: 10_000 })

    // Go to step 2
    await page.locator('.onboarding-primary-btn').click()
    await expect(page.locator('.onboarding-theme-grid')).toBeVisible()

    // Click a theme card (first one = dark)
    const themeCards = page.locator('.onboarding-theme-card')
    await expect(themeCards.first()).toBeVisible()
    const count = await themeCards.count()
    expect(count).toBeGreaterThanOrEqual(2) // at least dark + light

    // Click light theme (second card)
    if (count >= 2) {
      await themeCards.nth(1).click()
      await expect(themeCards.nth(1)).toHaveClass(/is-active/)
    }
  })

  test('terminal theme dropdown has options', async ({ page }) => {
    await expect(page.locator('.onboarding-overlay')).toBeVisible({ timeout: 10_000 })

    // Go to step 2
    await page.locator('.onboarding-primary-btn').click()
    await expect(page.locator('.onboarding-terminal-theme')).toBeVisible()

    // Click the el-select to open dropdown
    const select = page.locator('.onboarding-terminal-theme__select')
    await select.click()

    // Dropdown options should appear
    const options = page.locator('.onboarding-select-popper .el-select-dropdown__item')
    await expect(options.first()).toBeVisible({ timeout: 5_000 })
    const optionCount = await options.count()
    expect(optionCount).toBeGreaterThanOrEqual(5) // 10 presets
  })

  test('can complete all 3 steps', async ({ page }) => {
    await expect(page.locator('.onboarding-overlay')).toBeVisible({ timeout: 10_000 })

    // Step 1 → Step 2
    await page.locator('.onboarding-primary-btn').click()
    await expect(page.locator('.onboarding-theme-grid')).toBeVisible()

    // Step 2 → Step 3
    await page.locator('.onboarding-primary-btn').click()

    // Step 3: Quick actions should show
    await expect(page.locator('.onboarding-quick-actions')).toBeVisible()

    // Complete the wizard
    await page.locator('.onboarding-primary-btn').click()

    // Overlay should disappear
    await expect(page.locator('.onboarding-overlay')).not.toBeVisible({ timeout: 5_000 })
  })
})
