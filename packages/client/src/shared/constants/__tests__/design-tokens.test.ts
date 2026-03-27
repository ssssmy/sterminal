import { describe, it, expect } from 'vitest'
import { COLORS, SPACING, SHADOWS, RADII, MOTION, LAYOUT, Z_INDEX } from '../design-tokens'

describe('design-tokens snapshot', () => {
  it('COLORS has accent color #6366f1', () => {
    expect(COLORS.accent).toBe('#6366f1')
  })

  it('COLORS has dark and light palettes', () => {
    expect(COLORS.dark).toBeDefined()
    expect(COLORS.light).toBeDefined()
    expect(COLORS.dark.bgPrimary).toBe('#1a1b2e')
    expect(COLORS.light.bgPrimary).toBe('#ffffff')
  })

  it('COLORS dark palette has all required keys', () => {
    const keys = ['bgPrimary', 'bgSurface', 'bgInset', 'bgHover', 'bgInput',
      'textPrimary', 'textSecondary', 'textTertiary', 'border', 'divider',
      'sidebarBg', 'tabBg', 'tabActiveBg', 'terminalBg', 'scrollbarThumb']
    for (const key of keys) {
      expect(COLORS.dark).toHaveProperty(key)
    }
  })

  it('COLORS light palette has same keys as dark', () => {
    const darkKeys = Object.keys(COLORS.dark)
    const lightKeys = Object.keys(COLORS.light)
    expect(lightKeys).toEqual(darkKeys)
  })

  it('SPACING follows 4px grid', () => {
    expect(SPACING.xs).toBe(4)
    expect(SPACING.sm).toBe(8)
    expect(SPACING.md).toBe(12)
    expect(SPACING.lg).toBe(16)
    expect(SPACING.xl).toBe(20)
    expect(SPACING.xxl).toBe(24)
    expect(SPACING.xxxl).toBe(32)
  })

  it('SPACING values are all multiples of 4', () => {
    for (const [, val] of Object.entries(SPACING)) {
      expect(val % 4).toBe(0)
    }
  })

  it('SHADOWS has expected keys', () => {
    expect(SHADOWS).toHaveProperty('sm')
    expect(SHADOWS).toHaveProperty('md')
    expect(SHADOWS).toHaveProperty('lg')
    expect(SHADOWS).toHaveProperty('xl')
    expect(SHADOWS).toHaveProperty('dialog')
  })

  it('RADII has expected values', () => {
    expect(RADII.sm).toBe(4)
    expect(RADII.md).toBe(8)
    expect(RADII.lg).toBe(12)
    expect(RADII.xl).toBe(16)
    expect(RADII.full).toBe(9999)
  })

  it('MOTION has spring easing', () => {
    expect(MOTION.easingSpring).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)')
  })

  it('MOTION reduced duration is near-zero', () => {
    expect(MOTION.durationReduced).toBe('0.01s')
  })

  it('LAYOUT has correct macOS traffic light padding', () => {
    expect(LAYOUT.macosTrafficLightPadding).toBe(38)
  })

  it('LAYOUT has correct Windows titlebar padding', () => {
    expect(LAYOUT.windowsTitlebarPadding).toBe(138)
  })

  it('Z_INDEX layers are in ascending order', () => {
    expect(Z_INDEX.sidebar).toBeLessThan(Z_INDEX.toolbar)
    expect(Z_INDEX.toolbar).toBeLessThan(Z_INDEX.dropdown)
    expect(Z_INDEX.dropdown).toBeLessThan(Z_INDEX.modal)
    expect(Z_INDEX.modal).toBeLessThan(Z_INDEX.overlay)
    expect(Z_INDEX.overlay).toBeLessThan(Z_INDEX.toast)
    expect(Z_INDEX.toast).toBeLessThan(Z_INDEX.tooltip)
  })

  it('all color values are valid hex', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/
    for (const [, val] of Object.entries(COLORS.dark)) {
      expect(val).toMatch(hexPattern)
    }
    for (const [, val] of Object.entries(COLORS.light)) {
      expect(val).toMatch(hexPattern)
    }
    expect(COLORS.accent).toMatch(hexPattern)
    expect(COLORS.success).toMatch(hexPattern)
    expect(COLORS.warning).toMatch(hexPattern)
    expect(COLORS.error).toMatch(hexPattern)
  })
})
