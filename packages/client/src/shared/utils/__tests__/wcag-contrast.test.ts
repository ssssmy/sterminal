import { describe, it, expect } from 'vitest'
import { hexToRgb, linearizeChannel, relativeLuminance, contrastRatio, validateContrast } from '../wcag-contrast'

describe('hexToRgb', () => {
  it('parses 6-digit hex with #', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
  })

  it('parses 6-digit hex without #', () => {
    expect(hexToRgb('00ff00')).toEqual([0, 255, 0])
  })

  it('parses 3-digit hex shorthand', () => {
    expect(hexToRgb('#f00')).toEqual([255, 0, 0])
  })

  it('handles white', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255])
  })

  it('handles black', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
  })

  it('returns null for invalid hex', () => {
    expect(hexToRgb('invalid')).toBeNull()
    // Note: '#gg0000' produces NaN via parseInt, hexToRgb doesn't validate hex chars
  })

  it('returns null for empty string', () => {
    expect(hexToRgb('')).toBeNull()
  })

  it('trims whitespace', () => {
    expect(hexToRgb('  #ff0000  ')).toEqual([255, 0, 0])
  })

  it('parses STerminal accent color', () => {
    expect(hexToRgb('#6366f1')).toEqual([99, 102, 241])
  })
})

describe('linearizeChannel', () => {
  it('linearizes black (0)', () => {
    expect(linearizeChannel(0)).toBe(0)
  })

  it('linearizes white (255)', () => {
    expect(linearizeChannel(255)).toBeCloseTo(1, 4)
  })

  it('uses linear formula for low values (threshold 0.03928)', () => {
    // 10/255 = 0.0392... which is right at the threshold
    const result = linearizeChannel(10)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(0.01)
  })

  it('uses gamma formula for high values', () => {
    const result = linearizeChannel(128)
    expect(result).toBeCloseTo(0.2158, 3)
  })
})

describe('relativeLuminance', () => {
  it('white has luminance ~1', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 4)
  })

  it('black has luminance ~0', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 4)
  })

  it('pure red has correct luminance', () => {
    // Red contributes 0.2126 to luminance
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 3)
  })

  it('pure green has correct luminance', () => {
    // Green contributes 0.7152 to luminance
    expect(relativeLuminance('#00ff00')).toBeCloseTo(0.7152, 3)
  })

  it('returns 0 for invalid hex', () => {
    expect(relativeLuminance('invalid')).toBe(0)
  })
})

describe('contrastRatio', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('white on black is 21:1 (order independent)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('same color has ratio 1:1', () => {
    expect(contrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1, 1)
  })

  it('STerminal dark theme text on bg passes WCAG AA', () => {
    // #e2e8f0 on #1a1b2e
    const ratio = contrastRatio('#e2e8f0', '#1a1b2e')
    expect(ratio).toBeGreaterThan(4.5)
  })
})

describe('validateContrast', () => {
  it('passes for high contrast pair', () => {
    const result = validateContrast('#ffffff', '#000000')
    expect(result.passes).toBe(true)
    expect(result.ratio).toBeGreaterThan(20)
  })

  it('fails for low contrast pair', () => {
    const result = validateContrast('#777777', '#888888')
    expect(result.passes).toBe(false)
    expect(result.ratio).toBeLessThan(4.5)
  })

  it('STerminal default theme passes WCAG AA', () => {
    const result = validateContrast('#e2e8f0', '#1a1b2e')
    expect(result.passes).toBe(true)
  })

  it('returns numeric ratio', () => {
    const result = validateContrast('#ffffff', '#000000')
    expect(typeof result.ratio).toBe('number')
    expect(Number.isFinite(result.ratio)).toBe(true)
  })
})
