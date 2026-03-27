import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { setupTestDb, teardownTestDb, testDbAll, testDbGet, testDbRun } from './test-db-helper'

// Integration test: keybindings CRUD using real SQLite (in-memory)

describe('Keybindings IPC Handler (integration)', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterAll(() => {
    teardownTestDb()
  })

  describe('KEYBINDINGS_SET', () => {
    it('inserts a new keybinding', () => {
      testDbRun(
        `INSERT INTO keybindings (action, shortcut, sync_updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(action) DO UPDATE SET shortcut = excluded.shortcut, sync_updated_at = excluded.sync_updated_at`,
        ['command-palette', 'Ctrl+Shift+P']
      )

      const row = testDbGet<{ action: string; shortcut: string }>('SELECT * FROM keybindings WHERE action = ?', ['command-palette'])
      expect(row).toBeDefined()
      expect(row!.shortcut).toBe('Ctrl+Shift+P')
    })

    it('updates existing keybinding on conflict', () => {
      const sql = `INSERT INTO keybindings (action, shortcut, sync_updated_at)
                   VALUES (?, ?, datetime('now'))
                   ON CONFLICT(action) DO UPDATE SET shortcut = excluded.shortcut, sync_updated_at = excluded.sync_updated_at`
      testDbRun(sql, ['new-tab', 'Ctrl+T'])
      testDbRun(sql, ['new-tab', 'Ctrl+N'])

      const row = testDbGet<{ shortcut: string }>('SELECT shortcut FROM keybindings WHERE action = ?', ['new-tab'])
      expect(row!.shortcut).toBe('Ctrl+N')
    })
  })

  describe('KEYBINDINGS_LIST', () => {
    it('returns all keybindings ordered by action', () => {
      const sql = `INSERT INTO keybindings (action, shortcut) VALUES (?, ?)`
      testDbRun(sql, ['zoom-in', 'Ctrl++'])
      testDbRun(sql, ['close-tab', 'Ctrl+W'])
      testDbRun(sql, ['new-tab', 'Ctrl+T'])

      const rows = testDbAll<{ action: string; shortcut: string }>('SELECT * FROM keybindings ORDER BY action ASC')
      expect(rows).toHaveLength(3)
      expect(rows[0].action).toBe('close-tab')
      expect(rows[1].action).toBe('new-tab')
      expect(rows[2].action).toBe('zoom-in')
    })

    it('returns empty for no bindings', () => {
      const rows = testDbAll('SELECT * FROM keybindings')
      expect(rows).toHaveLength(0)
    })
  })

  describe('keybinding uniqueness', () => {
    it('action is primary key - no duplicates', () => {
      testDbRun(`INSERT INTO keybindings (action, shortcut) VALUES (?, ?)`, ['test', 'Ctrl+A'])
      expect(() => {
        testDbRun(`INSERT INTO keybindings (action, shortcut) VALUES (?, ?)`, ['test', 'Ctrl+B'])
      }).toThrow() // UNIQUE constraint
    })
  })
})
