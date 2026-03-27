import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { setupTestDb, teardownTestDb, testDbAll, testDbGet, testDbRun } from './test-db-helper'

// Integration test: hosts CRUD using real SQLite (in-memory)

describe('Hosts IPC Handler (integration)', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterAll(() => {
    teardownTestDb()
  })

  function createHost(label: string, address: string, overrides: Record<string, unknown> = {}) {
    const id = `host-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const port = (overrides.port as number) ?? 22
    const username = (overrides.username as string) ?? 'root'
    const groupId = (overrides.groupId as string) ?? null
    testDbRun(
      `INSERT INTO hosts (id, label, address, port, username, group_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, label, address, port, username, groupId]
    )
    return id
  }

  function createGroup(name: string) {
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    testDbRun(`INSERT INTO host_groups (id, name) VALUES (?, ?)`, [id, name])
    return id
  }

  describe('HOST_CREATE', () => {
    it('creates a host with basic fields', () => {
      const id = createHost('prod-server', '10.0.0.1')
      const row = testDbGet<any>('SELECT * FROM hosts WHERE id = ?', [id])

      expect(row).toBeDefined()
      expect(row.label).toBe('prod-server')
      expect(row.address).toBe('10.0.0.1')
      expect(row.port).toBe(22)
      expect(row.username).toBe('root')
      expect(row.protocol).toBe('ssh')
    })

    it('creates a host with custom port', () => {
      const id = createHost('custom-port', '10.0.0.2', { port: 2222 })
      const row = testDbGet<any>('SELECT port FROM hosts WHERE id = ?', [id])
      expect(row.port).toBe(2222)
    })

    it('creates a host in a group', () => {
      const groupId = createGroup('Production')
      const hostId = createHost('grouped-host', '10.0.0.3', { groupId })
      const row = testDbGet<any>('SELECT group_id FROM hosts WHERE id = ?', [hostId])
      expect(row.group_id).toBe(groupId)
    })
  })

  describe('HOST_LIST', () => {
    it('returns all hosts', () => {
      createHost('host1', '10.0.0.1')
      createHost('host2', '10.0.0.2')
      createHost('host3', '10.0.0.3')

      const rows = testDbAll('SELECT * FROM hosts')
      expect(rows).toHaveLength(3)
    })

    it('filters hosts by group', () => {
      const groupId = createGroup('Web')
      createHost('web1', '10.0.0.1', { groupId })
      createHost('web2', '10.0.0.2', { groupId })
      createHost('other', '10.0.0.3')

      const rows = testDbAll('SELECT * FROM hosts WHERE group_id = ?', [groupId])
      expect(rows).toHaveLength(2)
    })

    it('finds ungrouped hosts', () => {
      const groupId = createGroup('Grouped')
      createHost('grouped', '10.0.0.1', { groupId })
      createHost('ungrouped', '10.0.0.2')

      const rows = testDbAll('SELECT * FROM hosts WHERE group_id IS NULL')
      expect(rows).toHaveLength(1)
    })
  })

  describe('HOST_UPDATE', () => {
    it('updates host address', () => {
      const id = createHost('server', '10.0.0.1')
      testDbRun('UPDATE hosts SET address = ? WHERE id = ?', ['192.168.1.1', id])

      const row = testDbGet<any>('SELECT address FROM hosts WHERE id = ?', [id])
      expect(row.address).toBe('192.168.1.1')
    })

    it('updates host label', () => {
      const id = createHost('old-name', '10.0.0.1')
      testDbRun('UPDATE hosts SET label = ? WHERE id = ?', ['new-name', id])

      const row = testDbGet<any>('SELECT label FROM hosts WHERE id = ?', [id])
      expect(row.label).toBe('new-name')
    })

    it('increments sync_version', () => {
      const id = createHost('server', '10.0.0.1')
      testDbRun('UPDATE hosts SET label = ?, sync_version = sync_version + 1 WHERE id = ?', ['updated', id])

      const row = testDbGet<any>('SELECT sync_version FROM hosts WHERE id = ?', [id])
      expect(row.sync_version).toBe(2)
    })
  })

  describe('HOST_DELETE', () => {
    it('deletes a host', () => {
      const id = createHost('to-delete', '10.0.0.1')
      testDbRun('DELETE FROM hosts WHERE id = ?', [id])

      expect(testDbGet('SELECT * FROM hosts WHERE id = ?', [id])).toBeUndefined()
    })

    it('group survives host deletion', () => {
      const groupId = createGroup('Persistent')
      createHost('host', '10.0.0.1', { groupId })
      testDbRun('DELETE FROM hosts WHERE group_id = ?', [groupId])

      const group = testDbGet('SELECT * FROM host_groups WHERE id = ?', [groupId])
      expect(group).toBeDefined()
    })
  })

  describe('HOST_GROUPS', () => {
    it('creates and lists groups', () => {
      createGroup('Production')
      createGroup('Staging')
      createGroup('Development')

      const groups = testDbAll('SELECT * FROM host_groups ORDER BY name ASC')
      expect(groups).toHaveLength(3)
    })

    it('deletes group (cascade check)', () => {
      const groupId = createGroup('ToDelete')
      // Host with group_id FK — since foreign_keys is ON, we need to check behavior
      const hostId = createHost('host', '10.0.0.1', { groupId })

      // Deleting group should fail due to FK constraint (hosts references host_groups)
      expect(() => {
        testDbRun('DELETE FROM host_groups WHERE id = ?', [groupId])
      }).toThrow()

      // Delete host first, then group
      testDbRun('DELETE FROM hosts WHERE id = ?', [hostId])
      testDbRun('DELETE FROM host_groups WHERE id = ?', [groupId])

      expect(testDbGet('SELECT * FROM host_groups WHERE id = ?', [groupId])).toBeUndefined()
    })
  })

  describe('connect tracking', () => {
    it('increments connect_count', () => {
      const id = createHost('server', '10.0.0.1')
      testDbRun("UPDATE hosts SET connect_count = connect_count + 1, last_connected = datetime('now') WHERE id = ?", [id])
      testDbRun("UPDATE hosts SET connect_count = connect_count + 1, last_connected = datetime('now') WHERE id = ?", [id])

      const row = testDbGet<any>('SELECT connect_count FROM hosts WHERE id = ?', [id])
      expect(row.connect_count).toBe(2)
    })
  })
})
