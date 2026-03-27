import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '../defaults'

describe('DEFAULT_SETTINGS', () => {
  it('has terminal theme default', () => {
    expect(DEFAULT_SETTINGS['terminal.theme']).toBe('sterminal-dark')
  })

  it('has reasonable font size', () => {
    const size = DEFAULT_SETTINGS['terminal.fontSize'] as number
    expect(size).toBeGreaterThanOrEqual(8)
    expect(size).toBeLessThanOrEqual(32)
  })

  it('has zoom level in valid range', () => {
    const zoom = DEFAULT_SETTINGS['app.zoomLevel'] as number
    expect(zoom).toBeGreaterThanOrEqual(0.5)
    expect(zoom).toBeLessThanOrEqual(2.0)
  })

  it('has app.theme set to system', () => {
    expect(DEFAULT_SETTINGS['app.theme']).toBe('system')
  })

  it('has accent color as hex', () => {
    expect(DEFAULT_SETTINGS['app.accentColor']).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('notification.events is valid JSON array', () => {
    const raw = DEFAULT_SETTINGS['notification.events'] as string
    const parsed = JSON.parse(raw)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
  })

  it('autocomplete.sources is valid JSON array', () => {
    const raw = DEFAULT_SETTINGS['autocomplete.sources'] as string
    const parsed = JSON.parse(raw)
    expect(Array.isArray(parsed)).toBe(true)
  })

  it('all values are string, number, or boolean', () => {
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      const t = typeof val
      expect(['string', 'number', 'boolean']).toContain(t)
    }
  })

  it('has at least 50 settings', () => {
    expect(Object.keys(DEFAULT_SETTINGS).length).toBeGreaterThanOrEqual(50)
  })

  it('scrollback is a positive integer', () => {
    const val = DEFAULT_SETTINGS['terminal.scrollback'] as number
    expect(val).toBeGreaterThan(0)
    expect(Number.isInteger(val)).toBe(true)
  })

  it('vault clipboard clear time is positive', () => {
    const val = DEFAULT_SETTINGS['vault.clipboardClearTime'] as number
    expect(val).toBeGreaterThan(0)
  })

  it('log maxFileSize is reasonable', () => {
    const val = DEFAULT_SETTINGS['log.maxFileSize'] as number
    expect(val).toBeGreaterThan(0)
    expect(val).toBeLessThanOrEqual(500 * 1024 * 1024) // max 500MB
  })
})
