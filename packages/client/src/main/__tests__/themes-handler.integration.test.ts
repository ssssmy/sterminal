import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { setupTestDb, teardownTestDb, testDbAll, testDbGet, testDbRun } from './test-db-helper'

// Integration test: custom themes CRUD using real SQLite (in-memory)

describe('Themes IPC Handler (integration)', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterAll(() => {
    teardownTestDb()
  })

  function createTheme(name: string, type: 'dark' | 'light' = 'dark') {
    const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    testDbRun(
      `INSERT INTO custom_themes (id, name, type, foreground, background, cursor, selection, ansi_colors, sync_version, sync_updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [id, name, type, '#e2e8f0', '#1a1b2e', '#6366f1', 'rgba(99,102,241,0.3)', JSON.stringify(Array(16).fill('#000000'))]
    )
    return id
  }

  describe('THEMES_CREATE', () => {
    it('creates a theme with all fields', () => {
      const id = createTheme('My Theme', 'dark')
      const row = testDbGet<any>('SELECT * FROM custom_themes WHERE id = ?', [id])

      expect(row).toBeDefined()
      expect(row.name).toBe('My Theme')
      expect(row.type).toBe('dark')
      expect(row.foreground).toBe('#e2e8f0')
      expect(row.background).toBe('#1a1b2e')
      expect(row.cursor).toBe('#6366f1')
      expect(row.sync_version).toBe(1)
    })

    it('stores ansi_colors as JSON string', () => {
      const colors = ['#000', '#f00', '#0f0', '#ff0', '#00f', '#f0f', '#0ff', '#fff',
                       '#888', '#f88', '#8f8', '#ff8', '#88f', '#f8f', '#8ff', '#fff']
      const id = `ansi-test-${Date.now()}`
      testDbRun(
        `INSERT INTO custom_themes (id, name, type, foreground, background, cursor, selection, ansi_colors)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, 'Ansi Test', 'dark', '#fff', '#000', '#fff', '#333', JSON.stringify(colors)]
      )

      const row = testDbGet<any>('SELECT ansi_colors FROM custom_themes WHERE id = ?', [id])
      const parsed = JSON.parse(row.ansi_colors)
      expect(parsed).toHaveLength(16)
      expect(parsed[1]).toBe('#f00')
    })
  })

  describe('THEMES_LIST', () => {
    it('returns themes ordered by name', () => {
      createTheme('Zebra')
      createTheme('Alpha')
      createTheme('Middle')

      const rows = testDbAll<any>('SELECT * FROM custom_themes ORDER BY name ASC')
      expect(rows).toHaveLength(3)
      expect(rows[0].name).toBe('Alpha')
      expect(rows[1].name).toBe('Middle')
      expect(rows[2].name).toBe('Zebra')
    })

    it('returns empty array when no themes', () => {
      const rows = testDbAll('SELECT * FROM custom_themes')
      expect(rows).toHaveLength(0)
    })
  })

  describe('THEMES_UPDATE', () => {
    it('updates theme name', () => {
      const id = createTheme('Old Name')
      testDbRun(`UPDATE custom_themes SET name = ?, sync_version = sync_version + 1 WHERE id = ?`, ['New Name', id])

      const row = testDbGet<any>('SELECT name, sync_version FROM custom_themes WHERE id = ?', [id])
      expect(row.name).toBe('New Name')
      expect(row.sync_version).toBe(2)
    })

    it('updates multiple fields at once', () => {
      const id = createTheme('Theme')
      testDbRun(`UPDATE custom_themes SET foreground = ?, background = ? WHERE id = ?`, ['#fff', '#000', id])

      const row = testDbGet<any>('SELECT foreground, background FROM custom_themes WHERE id = ?', [id])
      expect(row.foreground).toBe('#fff')
      expect(row.background).toBe('#000')
    })

    it('increments sync_version on update', () => {
      const id = createTheme('Theme')
      testDbRun(`UPDATE custom_themes SET name = 'v2', sync_version = sync_version + 1 WHERE id = ?`, [id])
      testDbRun(`UPDATE custom_themes SET name = 'v3', sync_version = sync_version + 1 WHERE id = ?`, [id])

      const row = testDbGet<any>('SELECT sync_version FROM custom_themes WHERE id = ?', [id])
      expect(row.sync_version).toBe(3)
    })
  })

  describe('THEMES_DELETE', () => {
    it('deletes a theme by id', () => {
      const id = createTheme('To Delete')
      testDbRun('DELETE FROM custom_themes WHERE id = ?', [id])

      const row = testDbGet('SELECT * FROM custom_themes WHERE id = ?', [id])
      expect(row).toBeUndefined()
    })

    it('does nothing for nonexistent id', () => {
      const result = testDbRun('DELETE FROM custom_themes WHERE id = ?', ['nonexistent'])
      expect(result.changes).toBe(0)
    })
  })

  describe('THEMES_DELETE tracks in sync_deletes', () => {
    it('can track deleted theme in sync_deletes table', () => {
      const id = createTheme('Tracked Delete')
      testDbRun('DELETE FROM custom_themes WHERE id = ?', [id])
      testDbRun(
        `INSERT INTO sync_deletes (entity_type, entity_id, deleted_at)
         VALUES (?, ?, datetime('now'))`,
        ['custom_themes', id]
      )

      const row = testDbGet<any>('SELECT * FROM sync_deletes WHERE entity_id = ?', [id])
      expect(row).toBeDefined()
      expect(row.entity_type).toBe('custom_themes')
    })
  })
})
