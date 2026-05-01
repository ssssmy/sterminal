import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

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
import { up as upCrdt } from '../database/migrations/002_crdt.js'
import * as syncService from '../services/sync.service.js'
import type { SyncEntityInput, Tick } from '../validators/sync.schema.js'

const TEST_USER_ID = 'test-user-uuid-1234'
const DEVICE_A = 'device-a'
const DEVICE_B = 'device-b'

beforeAll(() => {
  up(testDb)
  upCrdt(testDb)
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

// 构造 CRDT 实体的辅助函数
function tick(ts: string, did = DEVICE_A): Tick {
  return { ts, did }
}

function entity(opts: {
  id: string
  entityType: SyncEntityInput['entityType']
  fields: Record<string, unknown>
  ts?: string
  did?: string
  tombstone?: Tick | null
}): SyncEntityInput {
  const t = opts.ts ?? new Date().toISOString()
  const did = opts.did ?? DEVICE_A
  const fieldMeta: Record<string, Tick> = {}
  for (const k of Object.keys(opts.fields)) {
    fieldMeta[k] = tick(t, did)
  }
  return {
    id: opts.id,
    entityType: opts.entityType,
    fields: opts.fields,
    fieldMeta,
    tombstone: opts.tombstone ?? null,
    updatedAt: t,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.pushSync (CRDT 字段级合并)', () => {
  it('新实体直接插入，accepted=1，无 conflicts', () => {
    const result = syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({ id: 'host-1', entityType: 'host', fields: { label: 'prod' } })],
    })

    expect(result.accepted).toBe(1)
    expect(result.conflicts).toHaveLength(0)

    const row = testDb
      .prepare('SELECT data, field_meta FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('host-1', TEST_USER_ID) as { data: string; field_meta: string }
    expect(JSON.parse(row.data).label).toBe('prod')
    expect(JSON.parse(row.field_meta).label).toBeDefined()
  })

  it('CRDT 协议下永远没有冲突——任意 push 都被合并', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({ id: 'host-2', entityType: 'host', fields: { label: 'v1' } })],
    })

    // 使用更大的时间戳推送 → 字段级合并接受新值
    const result = syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({
        id: 'host-2',
        entityType: 'host',
        fields: { label: 'v2' },
        ts: new Date(Date.now() + 1000).toISOString(),
      })],
    })

    expect(result.accepted).toBe(1)
    expect(result.conflicts).toHaveLength(0)

    const row = testDb
      .prepare('SELECT data FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('host-2', TEST_USER_ID) as { data: string }
    expect(JSON.parse(row.data).label).toBe('v2')
  })

  it('两个设备并发改不同字段：合并后两边都保留', () => {
    const baseTs = new Date(Date.now() - 1000).toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({
        id: 'host-merge',
        entityType: 'host',
        fields: { label: 'orig', port: 22, address: '1.1.1.1' },
        ts: baseTs,
        did: DEVICE_A,
      })],
    })

    // 设备 A 改 label
    const tsA = new Date(Date.now() + 100).toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-merge',
        entityType: 'host',
        fields: { label: 'a-changed', port: 22, address: '1.1.1.1' },
        fieldMeta: {
          label: tick(tsA, DEVICE_A),
          port: tick(baseTs, DEVICE_A),
          address: tick(baseTs, DEVICE_A),
        },
        tombstone: null,
        updatedAt: tsA,
      }],
    })

    // 设备 B 改 port（基于旧 base，没看到 A 的改动）
    const tsB = new Date(Date.now() + 200).toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      entities: [{
        id: 'host-merge',
        entityType: 'host',
        fields: { label: 'orig', port: 2222, address: '1.1.1.1' },
        fieldMeta: {
          label: tick(baseTs, DEVICE_A),
          port: tick(tsB, DEVICE_B),
          address: tick(baseTs, DEVICE_A),
        },
        tombstone: null,
        updatedAt: tsB,
      }],
    })

    const row = testDb
      .prepare('SELECT data FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('host-merge', TEST_USER_ID) as { data: string }
    const merged = JSON.parse(row.data)
    expect(merged.label).toBe('a-changed') // A 的修改保留
    expect(merged.port).toBe(2222)          // B 的修改保留
    expect(merged.address).toBe('1.1.1.1')  // 未改动字段保留
  })

  it('tombstone 推送：实体进入软删除', () => {
    const t1 = new Date(Date.now() - 1000).toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({ id: 'host-del', entityType: 'host', fields: { label: 'x' }, ts: t1 })],
    })

    const t2 = new Date().toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-del',
        entityType: 'host',
        fields: {},
        fieldMeta: {},
        tombstone: tick(t2, DEVICE_A),
        updatedAt: t2,
      }],
    })

    const row = testDb
      .prepare('SELECT deleted, tombstone_ts FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('host-del', TEST_USER_ID) as { deleted: number; tombstone_ts: string }
    expect(row.deleted).toBe(1)
    expect(row.tombstone_ts).toBeTruthy()
  })

  it('tombstone 之后字段更新（ts 更大）→ 实体复活', () => {
    const baseTs = new Date(Date.now() - 5000).toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({ id: 'host-resurrect', entityType: 'host', fields: { label: 'x' }, ts: baseTs })],
    })

    // 删除
    const tombTs = new Date(Date.now() - 1000).toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-resurrect',
        entityType: 'host',
        fields: {},
        fieldMeta: {},
        tombstone: tick(tombTs, DEVICE_A),
        updatedAt: tombTs,
      }],
    })

    // 在 tombTs 之后用新的 ts 修改字段 → 复活
    const reviveTs = new Date().toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      entities: [{
        id: 'host-resurrect',
        entityType: 'host',
        fields: { label: 'revived' },
        fieldMeta: { label: tick(reviveTs, DEVICE_B) },
        tombstone: null,
        updatedAt: reviveTs,
      }],
    })

    const row = testDb
      .prepare('SELECT data, deleted FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('host-resurrect', TEST_USER_ID) as { data: string; deleted: number }
    expect(row.deleted).toBe(0)                    // 复活
    expect(JSON.parse(row.data).label).toBe('revived')
  })

  it('删除前的修改（ts 更小）不能阻止 tombstone', () => {
    const oldTs = new Date(Date.now() - 5000).toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({ id: 'host-del-wins', entityType: 'host', fields: { label: 'x' }, ts: oldTs })],
    })

    // 设备 B 在 oldTs 后改了 label，但还没推
    const editTs = new Date(Date.now() - 3000).toISOString()
    // 设备 A 删除（更晚）
    const tombTs = new Date(Date.now() - 1000).toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'host-del-wins',
        entityType: 'host',
        fields: {},
        fieldMeta: {},
        tombstone: tick(tombTs, DEVICE_A),
        updatedAt: tombTs,
      }],
    })

    // B 现在才推送旧的修改（editTs < tombTs）
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      entities: [{
        id: 'host-del-wins',
        entityType: 'host',
        fields: { label: 'b-edit' },
        fieldMeta: { label: tick(editTs, DEVICE_B) },
        tombstone: null,
        updatedAt: editTs,
      }],
    })

    const row = testDb
      .prepare('SELECT deleted FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('host-del-wins', TEST_USER_ID) as { deleted: number }
    expect(row.deleted).toBe(1) // tombstone 仍生效
  })

  it('批量推送多个实体', () => {
    const entities = Array.from({ length: 5 }, (_, i) =>
      entity({ id: `snippet-${i}`, entityType: 'snippet', fields: { name: `s${i}` } })
    )
    const result = syncService.pushSync(TEST_USER_ID, { deviceId: DEVICE_A, entities })
    expect(result.accepted).toBe(5)
    expect(result.conflicts).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.pullSync', () => {
  beforeEach(() => {
    const base = Date.now() - 10000
    for (let i = 1; i <= 3; i++) {
      const ts = new Date(base + i * 1000).toISOString()
      syncService.pushSync(TEST_USER_ID, {
        deviceId: DEVICE_A,
        entities: [entity({ id: `pull-host-${i}`, entityType: 'host', fields: { label: `h${i}` }, ts })],
      })
    }
  })

  it('拉取所有数据（since=epoch）返回 fields + field_meta', () => {
    const result = syncService.pullSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      since: '1970-01-01T00:00:00Z',
      limit: 200,
    })

    expect(result.entities.length).toBeGreaterThanOrEqual(3)
    const first = result.entities[0]
    expect(first.fields).toBeTypeOf('object')
    expect(first.field_meta).toBeTypeOf('object')
    expect(first.tombstone_ts).toBeNull()
  })

  it('since 过滤只返回更新的实体', () => {
    const since = new Date(Date.now() - 5000).toISOString()
    const result = syncService.pullSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      since,
      limit: 200,
    })

    expect(result.entities.length).toBeLessThanOrEqual(3)
  })

  it('pullSync 返回 nextSince 时间戳', () => {
    const result = syncService.pullSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      since: '1970-01-01T00:00:00Z',
      limit: 200,
    })
    expect(result.nextSince).not.toBe('1970-01-01 00:00:00')
    expect(result.hasMore).toBe(false)
  })

  it('tombstone 实体也会通过 pull 返回（带 tombstone_ts）', () => {
    const ts = new Date().toISOString()
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [{
        id: 'tomb-pull',
        entityType: 'host',
        fields: {},
        fieldMeta: {},
        tombstone: tick(ts, DEVICE_A),
        updatedAt: ts,
      }],
    })

    const result = syncService.pullSync(TEST_USER_ID, {
      deviceId: DEVICE_B,
      since: '1970-01-01T00:00:00Z',
      limit: 200,
    })
    const tombEntity = result.entities.find(e => e.id === 'tomb-pull')
    expect(tombEntity).toBeDefined()
    expect(tombEntity!.tombstone_ts).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.deleteEntity', () => {
  it('管理 API 软删除指定实体', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({ id: 'to-delete', entityType: 'snippet', fields: { name: 'x' } })],
    })

    syncService.deleteEntity(TEST_USER_ID, 'snippet', 'to-delete')

    const row = testDb
      .prepare('SELECT deleted, tombstone_ts FROM sync_entities WHERE id = ? AND user_id = ?')
      .get('to-delete', TEST_USER_ID) as { deleted: number; tombstone_ts: string }
    expect(row.deleted).toBe(1)
    expect(row.tombstone_ts).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.getSyncCursors', () => {
  it('pushSync 后游标被写入', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: 'cursor-dev-1',
      entities: [entity({ id: 'cursor-entity-1', entityType: 'snippet', fields: {} })],
    })
    syncService.pushSync(TEST_USER_ID, { deviceId: 'cursor-dev-2', entities: [] })

    const cursors = syncService.getSyncCursors(TEST_USER_ID)
    const deviceIds = cursors.map(c => c.deviceId)
    expect(deviceIds).toContain('cursor-dev-1')
    expect(deviceIds).toContain('cursor-dev-2')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.pullFullSync', () => {
  it('返回该用户全部未删除实体', () => {
    for (let i = 1; i <= 3; i++) {
      syncService.pushSync(TEST_USER_ID, {
        deviceId: DEVICE_A,
        entities: [entity({ id: `full-${i}`, entityType: 'host', fields: {} })],
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

  it('已 tombstone 的实体不出现在 pullFullSync 结果中', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: DEVICE_A,
      entities: [entity({ id: 'soft-del', entityType: 'host', fields: {} })],
    })
    syncService.deleteEntity(TEST_USER_ID, 'host', 'soft-del')

    const result = syncService.pullFullSync(TEST_USER_ID)
    const ids = result.entities.map(e => e.id)
    expect(ids).not.toContain('soft-del')
  })

  it('limit + offset 分页', () => {
    for (let i = 1; i <= 5; i++) {
      const ts = new Date(Date.now() + i * 1000).toISOString()
      syncService.pushSync(TEST_USER_ID, {
        deviceId: DEVICE_A,
        entities: [entity({ id: `page-${i}`, entityType: 'snippet', fields: {}, ts })],
      })
    }

    const page1 = syncService.pullFullSync(TEST_USER_ID, 2, 0)
    expect(page1.entities.length).toBeLessThanOrEqual(2)
    expect(page1.hasMore).toBe(true)

    const page2 = syncService.pullFullSync(TEST_USER_ID, 2, 2)
    expect(page2.entities.length).toBeLessThanOrEqual(2)

    const ids1 = new Set(page1.entities.map(e => e.id))
    const ids2 = new Set(page2.entities.map(e => e.id))
    for (const id of ids1) expect(ids2.has(id)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('syncService.resetSync', () => {
  it('清空该用户全部 sync_entities + sync_cursors + encryption_salt', () => {
    syncService.pushSync(TEST_USER_ID, {
      deviceId: 'reset-dev',
      entities: [entity({ id: 'will-be-wiped', entityType: 'host', fields: {} })],
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
