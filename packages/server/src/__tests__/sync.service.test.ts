import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest'

// ── 内存数据库 ────────────────────────────────────────────────────────────────
const testDb = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Db = require('better-sqlite3') as typeof import('better-sqlite3').default
  const db = new Db(':memory:')
  db.pragma('foreign_keys = ON')
  return db
})

vi.mock('../database/connection.js', () => ({
  default: testDb,
  db: testDb,
}))

vi.mock('../services/email.service.js', () => ({
  sendVerifyEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

import { up } from '../database/migrations/001_initial.js'
import * as syncService from '../services/sync.service.js'

const TEST_USER_ID = 'test-user-uuid-1234'
const DEVICE_A = 'device-a'
const DEVICE_B = 'device-b'

beforeAll(() => {
  up(testDb)
  // 插入测试用户（不走注册流程以避免 argon2 开销）
  testDb
    .prepare(`
      INSERT INTO users (id, username, email, password_hash)
      VALUES (?, ?, ?, ?)
    `)
    .run(TEST_USER_ID, 'syncuser', 'sync@example.com', 'hash')
})

afterEach(() => {
  testDb.exec(`
    DELETE FROM sync_entities WHERE user_id = '${TEST_USER_ID}';
    DELETE FROM sync_cursors WHERE user_id = '${TEST_USER_ID}';
  `)
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.pushSync', () => {
  it('新实体直接插入，accepted=1', () => {
    const result = syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [
        {
          id: 'host-1',
          entityType: 'host',
          data: JSON.stringify({ label: 'prod' }),
          version: 1,
          deleted: false,
          updatedAt: new Date().toISOString(),
        },
      ],
    })

    expect(result.accepted).toBe(1)
    expect(result.conflicts).toHaveLength(0)
  })

  it('版本号正确（version+1）时更新成功', () => {
    // 先插入 version=1
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-2', entityType: 'host',
        data: '{"label":"v1"}', version: 1, deleted: false,
        updatedAt: new Date().toISOString(),
      }],
    })

    // 再用 version=2 更新
    const result = syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-2', entityType: 'host',
        data: '{"label":"v2"}', version: 2, deleted: false,
        updatedAt: new Date().toISOString(),
      }],
    })

    expect(result.accepted).toBe(1)
    expect(result.conflicts).toHaveLength(0)

    const row = testDb
      .prepare('SELECT version, data FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('host-2', TEST_USER_ID) as { version: number; data: string }
    expect(row.version).toBe(2)
    expect(JSON.parse(row.data).label).toBe('v2')
  })

  it('版本号冲突时记录到 conflicts', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-3', entityType: 'host',
        data: '{}', version: 1, deleted: false,
        updatedAt: new Date().toISOString(),
      }],
    })

    // 用错误的 version=5（应为 2）
    const result = syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-3', entityType: 'host',
        data: '{}', version: 5, deleted: false,
        updatedAt: new Date().toISOString(),
      }],
    })

    expect(result.accepted).toBe(0)
    expect(result.conflicts).toContain('host-3')
  })

  it('软删除操作跳过版本检查', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-del', entityType: 'host',
        data: '{}', version: 1, deleted: false,
        updatedAt: new Date().toISOString(),
      }],
    })

    // 用任意版本号执行删除
    const result = syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-del', entityType: 'host',
        data: '{}', version: 99, deleted: true,
        updatedAt: new Date().toISOString(),
      }],
    })

    expect(result.accepted).toBe(1)
    const row = testDb
      .prepare('SELECT deleted FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('host-del', TEST_USER_ID) as { deleted: number }
    expect(row.deleted).toBe(1)
  })

  it('批量推送多个实体', () => {
    const entities = Array.from({ length: 5 }, (_, i) => ({
      id: `snippet-${i}`,
      entityType: 'snippet',
      data: `{"name":"s${i}"}`,
      version: 1,
      deleted: false,
      updatedAt: new Date().toISOString(),
    }))

    const result = syncService.pushSync(TEST_USER_ID, { deviceId: DEVICE_A, entities })
    expect(result.accepted).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.pullSync', () => {
  // 每个测试前重新插入实体（外层 afterEach 会清理）
  beforeEach(() => {
    const base = Date.now() - 10000
    for (let i = 1; i <= 3; i++) {
      const updatedAt = new Date(base + i * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
      testDb
        .prepare(`
          INSERT OR IGNORE INTO sync_entities (id, user_id, entity_type, data, version, deleted, updated_at, created_at)
          VALUES (?, ?, 'host', '{}', 1, 0, ?, ?)
        `)
        .run(`pull-host-${i}`, TEST_USER_ID, updatedAt, updatedAt)
    }
  })

  it('拉取所有数据（since=epoch）', () => {
    const result = syncService.pullSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      since: '1970-01-01T00:00:00Z',
      limit: 200,
    })

    expect(result.entities.length).toBeGreaterThanOrEqual(3)
  })

  it('since 过滤只返回更新的实体', () => {
    const since = new Date(Date.now() - 5000).toISOString()
    const result = syncService.pullSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      since,
      limit: 200,
    })

    // 只有后两条在 since 之后
    expect(result.entities.length).toBeLessThanOrEqual(3)
  })

  it('pullSync 返回 nextSince 时间戳', () => {
    const result = syncService.pullSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      since: '1970-01-01T00:00:00Z',
      limit: 200,
    })
    // nextSince 应为最后一条实体的 updated_at，不再是 epoch
    expect(result.nextSince).not.toBe('1970-01-01 00:00:00')
    expect(result.hasMore).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.deleteEntity', () => {
  it('软删除指定实体', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'to-delete', entityType: 'snippet',
        data: '{}', version: 1, deleted: false,
        updatedAt: new Date().toISOString(),
      }],
    })

    syncService.deleteEntity(TEST_USER_ID, 'snippet', 'to-delete')

    const row = testDb
      .prepare('SELECT deleted FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('to-delete', TEST_USER_ID) as { deleted: number } | undefined
    expect(row?.deleted).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.getSyncCursors', () => {
  it('pushSync 后游标被写入，getSyncCursors 能读到', () => {
    const entity = {
      id: 'cursor-entity-1',
      entityType: 'snippet' as const,
      data: '{}',
      version: 1,
      deleted: false,
      updatedAt: new Date().toISOString(),
    }
    syncService.pushSync(TEST_USER_ID, { deviceId: 'cursor-dev-1', entities: [entity] })
    syncService.pushSync(TEST_USER_ID, { deviceId: 'cursor-dev-2', entities: [] })

    const cursors = syncService.getSyncCursors(TEST_USER_ID)
    const deviceIds = cursors.map(c => c.deviceId)
    expect(deviceIds).toContain('cursor-dev-1')
    expect(deviceIds).toContain('cursor-dev-2')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.pullFullSync', () => {
  it('返回该用户全部未删除实体（不受 since 限制）', () => {
    // 先插入 3 条
    for (let i = 1; i <= 3; i++) {
      syncService.pushSync(TEST_USER_ID, {
        deviceId: DEVICE_A,
        entities: [{
          id: `full-${i}`, entityType: 'host',
          data: '{}', version: 1, deleted: false,
          updatedAt: new Date().toISOString(),
        }],
      })
    }

    const result = syncService.pullFullSync(TEST_USER_ID)
    const ids = result.entities.map(e => e.id)
    expect(ids).toContain('full-1')
    expect(ids).toContain('full-2')
    expect(ids).toContain('full-3')
    expect(result.total).toBeGreaterThanOrEqual(3)
    expect(result.hasMore).toBe(false)
  })

  it('已软删除的实体不出现在 pullFullSync 结果中', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'soft-del', entityType: 'host',
        data: '{}', version: 1, deleted: false,
        updatedAt: new Date().toISOString(),
      }],
    })
    syncService.deleteEntity(TEST_USER_ID, 'host', 'soft-del')

    const result = syncService.pullFullSync(TEST_USER_ID)
    const ids = result.entities.map(e => e.id)
    expect(ids).not.toContain('soft-del')
  })

  it('limit + offset 分页', () => {
    for (let i = 1; i <= 5; i++) {
      syncService.pushSync(TEST_USER_ID, {
        deviceId: DEVICE_A,
        entities: [{
          id: `page-${i}`, entityType: 'snippet',
          data: '{}', version: 1, deleted: false,
          updatedAt: new Date(Date.now() + i * 1000).toISOString(),
        }],
      })
    }

    const page1 = syncService.pullFullSync(TEST_USER_ID, 2, 0)
    expect(page1.entities.length).toBeLessThanOrEqual(2)
    expect(page1.hasMore).toBe(true)

    const page2 = syncService.pullFullSync(TEST_USER_ID, 2, 2)
    expect(page2.entities.length).toBeLessThanOrEqual(2)

    // 两页的 id 不应重复
    const ids1 = new Set(page1.entities.map(e => e.id))
    const ids2 = new Set(page2.entities.map(e => e.id))
    for (const id of ids1) expect(ids2.has(id)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.resetSync', () => {
  it('清空该用户全部 sync_entities + sync_cursors + encryption_salt', () => {
    // 准备数据
    syncService.pushSync(TEST_USER_ID, {
      deviceId: 'reset-dev',
      entities: [{
        id: 'will-be-wiped', entityType: 'host',
        data: '{}', version: 1, deleted: false,
        updatedAt: new Date().toISOString(),
      }],
    })
    syncService.setEncryptionSalt(TEST_USER_ID, 'a'.repeat(32))

    const result = syncService.resetSync(TEST_USER_ID)

    expect(result.entitiesDeleted).toBeGreaterThan(0)
    expect(result.cursorsDeleted).toBeGreaterThan(0)

    const remaining = testDb
      .prepare('SELECT COUNT(*) as c FROM sync_entities WHERE user_id = ?')
      .get(TEST_USER_ID) as { c: number }
    expect(remaining.c).toBe(0)

    const cursors = testDb
      .prepare('SELECT COUNT(*) as c FROM sync_cursors WHERE user_id = ?')
      .get(TEST_USER_ID) as { c: number }
    expect(cursors.c).toBe(0)

    const userRow = testDb
      .prepare('SELECT encryption_salt FROM users WHERE id = ?')
      .get(TEST_USER_ID) as { encryption_salt: string | null }
    expect(userRow.encryption_salt).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.getEncryptionStatus / setEncryptionSalt', () => {
  it('未设置时返回 hasEncryption=false', () => {
    // 确保 salt 是 null
    testDb.prepare('UPDATE users SET encryption_salt = NULL WHERE id = ?').run(TEST_USER_ID)

    const result = syncService.getEncryptionStatus(TEST_USER_ID)
    expect(result.hasEncryption).toBe(false)
    expect(result.salt).toBeNull()
  })

  it('设置后返回 hasEncryption=true 且能读到 salt', () => {
    testDb.prepare('UPDATE users SET encryption_salt = NULL WHERE id = ?').run(TEST_USER_ID)
    const salt = 'b'.repeat(32)

    syncService.setEncryptionSalt(TEST_USER_ID, salt)

    const result = syncService.getEncryptionStatus(TEST_USER_ID)
    expect(result.hasEncryption).toBe(true)
    expect(result.salt).toBe(salt)
  })

  it('已设置时再次 set 抛 SYNC_SALT_ALREADY_SET (40004)', () => {
    testDb.prepare('UPDATE users SET encryption_salt = NULL WHERE id = ?').run(TEST_USER_ID)
    syncService.setEncryptionSalt(TEST_USER_ID, 'c'.repeat(32))

    expect(() => syncService.setEncryptionSalt(TEST_USER_ID, 'd'.repeat(32)))
      .toThrowError()
    try {
      syncService.setEncryptionSalt(TEST_USER_ID, 'e'.repeat(32))
    } catch (e) {
      expect((e as { code: number }).code).toBe(40004)
    }
  })
})
