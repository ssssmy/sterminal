import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { setupTestDb, teardownTestDb, testDbAll, testDbGet, testDbRun } from './test-db-helper'

// Integration test: snippets CRUD using real SQLite (in-memory)

describe('Snippets IPC Handler (integration)', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterAll(() => {
    teardownTestDb()
  })

  function createSnippet(name: string, command: string, groupId?: string) {
    const id = `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    testDbRun(
      `INSERT INTO snippets (id, name, content, description, group_id, sort_order, use_count)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      [id, name, command, '', groupId ?? null]
    )
    return id
  }

  function createSnippetGroup(name: string) {
    const id = `sgroup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    testDbRun(`INSERT INTO snippet_groups (id, name) VALUES (?, ?)`, [id, name])
    return id
  }

  describe('SNIPPET_CREATE', () => {
    it('creates a snippet', () => {
      const id = createSnippet('restart nginx', 'systemctl restart nginx')
      const row = testDbGet<any>('SELECT * FROM snippets WHERE id = ?', [id])
      expect(row).toBeDefined()
      expect(row.name).toBe('restart nginx')
      expect(row.content).toBe('systemctl restart nginx')
      expect(row.use_count).toBe(0)
    })

    it('creates a snippet in a group', () => {
      const groupId = createSnippetGroup('Deploy')
      const id = createSnippet('deploy', 'git pull && npm run build', groupId)
      const row = testDbGet<any>('SELECT group_id FROM snippets WHERE id = ?', [id])
      expect(row.group_id).toBe(groupId)
    })
  })

  describe('SNIPPET_LIST', () => {
    it('lists all snippets', () => {
      createSnippet('s1', 'cmd1')
      createSnippet('s2', 'cmd2')
      const rows = testDbAll('SELECT * FROM snippets')
      expect(rows).toHaveLength(2)
    })
  })

  describe('SNIPPET_USE_COUNT', () => {
    it('increments use_count', () => {
      const id = createSnippet('used', 'echo hello')
      testDbRun('UPDATE snippets SET use_count = use_count + 1 WHERE id = ?', [id])
      testDbRun('UPDATE snippets SET use_count = use_count + 1 WHERE id = ?', [id])
      testDbRun('UPDATE snippets SET use_count = use_count + 1 WHERE id = ?', [id])

      const row = testDbGet<any>('SELECT use_count FROM snippets WHERE id = ?', [id])
      expect(row.use_count).toBe(3)
    })
  })

  describe('SNIPPET_DELETE', () => {
    it('deletes a snippet', () => {
      const id = createSnippet('temp', 'echo tmp')
      testDbRun('DELETE FROM snippets WHERE id = ?', [id])
      expect(testDbGet('SELECT * FROM snippets WHERE id = ?', [id])).toBeUndefined()
    })
  })

  describe('snippet with variables', () => {
    it('stores command with variable placeholders', () => {
      const id = createSnippet('deploy', 'ssh ${user:root}@${host} "cd ${path:/var/www} && git pull"')
      const row = testDbGet<any>('SELECT content FROM snippets WHERE id = ?', [id])
      expect(row.content).toContain('${user:root}')
      expect(row.content).toContain('${host}')
      expect(row.content).toContain('${path:/var/www}')
    })
  })
})
