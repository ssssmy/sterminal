import { describe, it, expect } from 'vitest'
import { TERMINAL_THEME_PRESETS, findThemePreset, type TerminalThemePreset } from '../terminal-themes'

const hexPattern = /^#[0-9a-fA-F]{6}$/
const colorKeys: (keyof TerminalThemePreset['colors'])[] = [
  'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
]

describe('TERMINAL_THEME_PRESETS', () => {
  it('has at least 5 presets', () => {
    expect(TERMINAL_THEME_PRESETS.length).toBeGreaterThanOrEqual(5)
  })

  it('all presets have unique IDs', () => {
    const ids = TERMINAL_THEME_PRESETS.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all presets have non-empty name', () => {
    for (const preset of TERMINAL_THEME_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0)
    }
  })

  it('all presets have valid type', () => {
    for (const preset of TERMINAL_THEME_PRESETS) {
      expect(['dark', 'light']).toContain(preset.type)
    }
  })

  it('all presets have all 20 color fields', () => {
    for (const preset of TERMINAL_THEME_PRESETS) {
      for (const key of colorKeys) {
        expect(preset.colors).toHaveProperty(key)
      }
    }
  })

  it('all color values are valid hex', () => {
    for (const preset of TERMINAL_THEME_PRESETS) {
      for (const key of colorKeys) {
        const val = preset.colors[key]
        // selectionBackground may use rgba format
        if (key === 'selectionBackground' && val.startsWith('rgba')) continue
        expect(val, `${preset.id}.${key}`).toMatch(hexPattern)
      }
    }
  })

  it('first preset is sterminal-dark', () => {
    expect(TERMINAL_THEME_PRESETS[0].id).toBe('sterminal-dark')
  })

  it('includes both dark and light presets', () => {
    const types = new Set(TERMINAL_THEME_PRESETS.map(t => t.type))
    expect(types.has('dark')).toBe(true)
    expect(types.has('light')).toBe(true)
  })
})

describe('findThemePreset', () => {
  it('finds existing preset by ID', () => {
    const preset = findThemePreset('sterminal-dark')
    expect(preset.id).toBe('sterminal-dark')
  })

  it('returns first preset for unknown ID', () => {
    const preset = findThemePreset('nonexistent')
    expect(preset.id).toBe(TERMINAL_THEME_PRESETS[0].id)
  })

  it('returns first preset for empty string', () => {
    const preset = findThemePreset('')
    expect(preset.id).toBe(TERMINAL_THEME_PRESETS[0].id)
  })
})
