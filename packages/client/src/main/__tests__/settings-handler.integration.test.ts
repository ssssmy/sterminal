import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { setupTestDb, teardownTestDb, testDbAll, testDbGet, testDbRun } from './test-db-helper'
import { DEFAULT_SETTINGS } from '../../shared/constants/defaults'

// Integration test: settings CRUD using real SQLite (in-memory)
// Tests the exact SQL patterns from db.handler.ts registerSettingsHandlers

describe('Settings IPC Handler (integration)', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterAll(() => {
    teardownTestDb()
  })

  describe('SETTINGS_SET + SETTINGS_GET', () => {
    it('stores and retrieves a string setting', () => {
      const key = 'app.theme'
      const value = 'dark'
      testDbRun(
        `INSERT INTO settings (key, value, sync_updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, sync_updated_at = excluded.sync_updated_at`,
        [key, JSON.stringify(value)]
      )

      const row = testDbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
      expect(JSON.parse(row!.value)).toBe('dark')
    })

    it('stores and retrieves a numeric setting', () => {
      testDbRun(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ['terminal.fontSize', JSON.stringify(16)]
      )

      const row = testDbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['terminal.fontSize'])
      expect(JSON.parse(row!.value)).toBe(16)
    })

    it('stores and retrieves a boolean setting', () => {
      testDbRun(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ['terminal.cursorBlink', JSON.stringify(false)]
      )

      const row = testDbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['terminal.cursorBlink'])
      expect(JSON.parse(row!.value)).toBe(false)
    })

    it('upserts on conflict', () => {
      const sql = `INSERT INTO settings (key, value) VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      testDbRun(sql, ['app.theme', JSON.stringify('dark')])
      testDbRun(sql, ['app.theme', JSON.stringify('light')])

      const row = testDbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['app.theme'])
      expect(JSON.parse(row!.value)).toBe('light')
    })

    it('returns undefined for missing key', () => {
      const row = testDbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['nonexistent'])
      expect(row).toBeUndefined()
    })
  })

  describe('SETTINGS_GET_ALL', () => {
    it('returns all settings as key-value map', () => {
      testDbRun(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['a', JSON.stringify(1)])
      testDbRun(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['b', JSON.stringify('two')])
      testDbRun(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['c', JSON.stringify(true)])

      const rows = testDbAll<{ key: string; value: string }>('SELECT key, value FROM settings')
      const result: Record<string, unknown> = {}
      for (const row of rows) {
        try { result[row.key] = JSON.parse(row.value) } catch { result[row.key] = row.value }
      }

      expect(result).toEqual({ a: 1, b: 'two', c: true })
    })

    it('returns empty object for empty table', () => {
      const rows = testDbAll('SELECT key, value FROM settings')
      expect(rows).toHaveLength(0)
    })
  })

  describe('SETTINGS_RESET', () => {
    it('deletes all settings', () => {
      testDbRun(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['a', '"1"'])
      testDbRun(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['b', '"2"'])
      testDbRun('DELETE FROM settings')

      const rows = testDbAll('SELECT * FROM settings')
      expect(rows).toHaveLength(0)
    })
  })
})
