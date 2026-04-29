import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest'
import request from 'supertest'

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

// 关掉限流：API 测试要在同一秒内打很多次同一端点
vi.mock('../middleware/rate-limit.js', () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next()
  return {
    authLimiter: passthrough,
    apiLimiter: passthrough,
    syncLimiter: passthrough,
  }
})

import { up } from '../database/migrations/001_initial.js'
import { createApp } from '../app.js'

const app = createApp()

beforeAll(() => {
  up(testDb)
})

afterEach(() => {
  testDb.exec(`
    DELETE FROM sessions;
    DELETE FROM login_attempts;
    DELETE FROM password_resets;
    DELETE FROM sync_entities;
    DELETE FROM sync_cursors;
    DELETE FROM users;
  `)
})

/**
 * 注册一个用户并返回 token，便于在需要认证的测试里复用
 */
async function registerAndLogin(
  username = 'apiuser',
  email = 'api@test.com',
  password = 'Password1!',
): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ username, email, password })
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return { token: res.body.data.token, userId: res.body.data.user.id }
}

// ============================================================================
// 健康检查
// ============================================================================
describe('GET /health', () => {
  it('返回 200 + status=ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('ok')
  })
})

// ============================================================================
// 认证 - 注册
// ============================================================================
describe('POST /api/v1/auth/register', () => {
  it('成功注册返回 201 + token + 用户对象', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'newuser', email: 'new@test.com', password: 'Password1!' })

    expect(res.status).toBe(201)
    expect(res.body.code).toBe(0)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.user.email).toBe('new@test.com')
    expect(res.body.data.user.password_hash).toBeUndefined()
    expect(res.body.data.user.verify_token).toBeUndefined()
  })

  it('邮箱重复返回 409 + code=40901', async () => {
    await registerAndLogin('user1', 'dup@test.com', 'Password1!')
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'user2', email: 'dup@test.com', password: 'Password1!' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe(40901)
  })

  it('用户名重复返回 409 + code=40902', async () => {
    await registerAndLogin('dupname', 'a@test.com', 'Password1!')
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'dupname', email: 'b@test.com', password: 'Password1!' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe(40902)
  })

  it('请求体校验失败返回 400 + code=40000', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'x', email: 'not-an-email', password: '123' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(40000)
    expect(res.body.data).toBeTruthy()
  })

  it('缺少必填字段返回 400', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe(40000)
  })
})

// ============================================================================
// 认证 - 登录
// ============================================================================
describe('POST /api/v1/auth/login', () => {
  it('正确凭据登录成功，返回 token', async () => {
    await registerAndLogin('loginu', 'login@test.com', 'Password1!')

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.com', password: 'Password1!' })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.token).toBeTruthy()
  })

  it('密码错误返回 401 + code=40101', async () => {
    await registerAndLogin('loginu2', 'login2@test.com', 'Password1!')

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login2@test.com', password: 'WrongPass1!' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe(40101)
  })

  it('邮箱不存在返回 401 + code=40101', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'Password1!' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe(40101)
  })

  it('登录失败 5 次后锁定 (PRD)，返回 429 + code=42901', async () => {
    await registerAndLogin('lockedu', 'locked@test.com', 'Password1!')

    // 提前注入 5 条失败记录
    for (let i = 0; i < 5; i++) {
      testDb
        .prepare(`INSERT INTO login_attempts (id, email, ip_address, success) VALUES (?, ?, NULL, 0)`)
        .run(`api-attempt-${i}`, 'locked@test.com')
    }

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'locked@test.com', password: 'Password1!' })

    expect(res.status).toBe(429)
    expect(res.body.code).toBe(42901)
  })
})

// ============================================================================
// 认证 - 登出
// ============================================================================
describe('POST /api/v1/auth/logout', () => {
  it('已登录用户登出后会话被删除', async () => {
    const { token, userId } = await registerAndLogin('logoutu', 'logout@test.com')

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const remaining = testDb
      .prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?')
      .get(userId) as { c: number }
    expect(remaining.c).toBe(0)
  })

  it('未提供 token 时返回 401 + code=40102', async () => {
    const res = await request(app).post('/api/v1/auth/logout')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe(40102)
  })
})

// ============================================================================
// 用户 - getMe
// ============================================================================
describe('GET /api/v1/user/me', () => {
  it('返回当前用户 + 续签 token', async () => {
    const { token, userId } = await registerAndLogin('meu', 'me@test.com')

    const res = await request(app)
      .get('/api/v1/user/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(userId)
    expect(res.body.data.email).toBe('me@test.com')
    expect(res.body.data.token).toBeTruthy() // 续签
    expect(res.body.data.password_hash).toBeUndefined()
  })

  it('无效 token 返回 401 + code=40103', async () => {
    const res = await request(app)
      .get('/api/v1/user/me')
      .set('Authorization', 'Bearer not-a-real-token')

    expect(res.status).toBe(401)
    expect(res.body.code).toBe(40103)
  })

  it('缺失 Authorization 头返回 401 + code=40102', async () => {
    const res = await request(app).get('/api/v1/user/me')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe(40102)
  })
})

// ============================================================================
// 用户 - 修改密码
// ============================================================================
describe('PUT /api/v1/user/me/password', () => {
  it('密码正确则修改成功', async () => {
    const { token } = await registerAndLogin('pwdu', 'pwd@test.com', 'OldPassword1!')

    const res = await request(app)
      .put('/api/v1/user/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OldPassword1!', newPassword: 'NewPassword1!' })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    // 用新密码可以登录
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pwd@test.com', password: 'NewPassword1!' })
    expect(login.status).toBe(200)
  })

  it('当前密码错误返回 400 + code=40003', async () => {
    const { token } = await registerAndLogin('pwdu2', 'pwd2@test.com', 'OldPassword1!')

    const res = await request(app)
      .put('/api/v1/user/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongOld1!', newPassword: 'NewPassword1!' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(40003)
  })
})

// ============================================================================
// 同步 - push / pull
// ============================================================================
describe('Sync push & pull', () => {
  it('push 合法实体后 pull 能读到', async () => {
    const { token } = await registerAndLogin('syncu', 'sync-api@test.com')

    const push = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'dev-a',
        entities: [{
          id: 'host-x', entityType: 'host', data: '{"label":"x"}',
          version: 1, deleted: false, updatedAt: new Date().toISOString(),
        }],
      })

    expect(push.status).toBe(200)
    expect(push.body.data.accepted).toBe(1)
    expect(push.body.data.conflicts).toEqual([])

    const pull = await request(app)
      .get('/api/v1/sync/pull')
      .set('Authorization', `Bearer ${token}`)
      .query({ deviceId: 'dev-b', since: '1970-01-01T00:00:00Z', limit: 100 })

    expect(pull.status).toBe(200)
    expect(pull.body.data.entities.length).toBeGreaterThanOrEqual(1)
    expect(pull.body.data.entities[0].id).toBe('host-x')
  })

  it('未认证访问 sync/push 返回 401', async () => {
    const res = await request(app)
      .post('/api/v1/sync/push')
      .send({ deviceId: 'dev', entities: [] })

    expect(res.status).toBe(401)
  })

  it('版本冲突进入 conflicts 列表', async () => {
    const { token } = await registerAndLogin('confu', 'conf@test.com')

    await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'd1',
        entities: [{
          id: 'h1', entityType: 'host', data: '{}',
          version: 1, deleted: false, updatedAt: new Date().toISOString(),
        }],
      })

    const push2 = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'd1',
        entities: [{
          id: 'h1', entityType: 'host', data: '{}',
          version: 99, deleted: false, updatedAt: new Date().toISOString(),
        }],
      })

    expect(push2.body.data.accepted).toBe(0)
    expect(push2.body.data.conflicts).toContain('h1')
  })
})

// ============================================================================
// 同步 - full / reset / encryption
// ============================================================================
describe('Sync full / reset / encryption', () => {
  it('GET /sync/full 返回该用户全部未删除实体', async () => {
    const { token } = await registerAndLogin('fullu', 'full@test.com')

    // push 3 条
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: 'd',
          entities: [{
            id: `f-${i}`, entityType: 'snippet', data: '{}',
            version: 1, deleted: false, updatedAt: new Date().toISOString(),
          }],
        })
    }

    const res = await request(app)
      .get('/api/v1/sync/full')
      .set('Authorization', `Bearer ${token}`)
      .query({ deviceId: 'newdev' })

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBeGreaterThanOrEqual(3)
    const ids = (res.body.data.entities as Array<{ id: string }>).map(e => e.id)
    expect(ids).toContain('f-1')
    expect(ids).toContain('f-3')
  })

  it('POST /sync/reset 密码错误返回 40003', async () => {
    const { token } = await registerAndLogin('resu', 'reset@test.com', 'Password1!')

    const res = await request(app)
      .post('/api/v1/sync/reset')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'WrongOne1!', confirm: 'CONFIRM RESET' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(40003)
  })

  it('POST /sync/reset confirm 字段不匹配返回 400 校验失败', async () => {
    const { token } = await registerAndLogin('resu2', 'reset2@test.com', 'Password1!')

    const res = await request(app)
      .post('/api/v1/sync/reset')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Password1!', confirm: 'NOT MATCHING' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(40000)
  })

  it('POST /sync/reset 密码正确则清空数据', async () => {
    const { token, userId } = await registerAndLogin('resu3', 'reset3@test.com', 'Password1!')

    // push 一些数据
    await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'd',
        entities: [{
          id: 'will-reset', entityType: 'host', data: '{}',
          version: 1, deleted: false, updatedAt: new Date().toISOString(),
        }],
      })

    const res = await request(app)
      .post('/api/v1/sync/reset')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Password1!', confirm: 'CONFIRM RESET' })

    expect(res.status).toBe(200)
    expect(res.body.data.entitiesDeleted).toBeGreaterThan(0)

    const remaining = testDb
      .prepare('SELECT COUNT(*) as c FROM sync_entities WHERE user_id = ?')
      .get(userId) as { c: number }
    expect(remaining.c).toBe(0)
  })

  it('GET /sync/encryption 默认 hasEncryption=false', async () => {
    const { token } = await registerAndLogin('encu', 'enc@test.com')
    const res = await request(app)
      .get('/api/v1/sync/encryption')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.hasEncryption).toBe(false)
    expect(res.body.data.salt).toBeNull()
  })

  it('PUT /sync/encryption 设置 salt 后 GET 能读到', async () => {
    const { token } = await registerAndLogin('encu2', 'enc2@test.com')
    const salt = 'a'.repeat(32)

    const put = await request(app)
      .put('/api/v1/sync/encryption')
      .set('Authorization', `Bearer ${token}`)
      .send({ salt })

    expect(put.status).toBe(200)

    const get = await request(app)
      .get('/api/v1/sync/encryption')
      .set('Authorization', `Bearer ${token}`)

    expect(get.body.data.hasEncryption).toBe(true)
    expect(get.body.data.salt).toBe(salt)
  })

  it('PUT /sync/encryption 重复设置返回 40004', async () => {
    const { token } = await registerAndLogin('encu3', 'enc3@test.com')

    await request(app)
      .put('/api/v1/sync/encryption')
      .set('Authorization', `Bearer ${token}`)
      .send({ salt: 'b'.repeat(32) })

    const second = await request(app)
      .put('/api/v1/sync/encryption')
      .set('Authorization', `Bearer ${token}`)
      .send({ salt: 'c'.repeat(32) })

    expect(second.status).toBe(400)
    expect(second.body.code).toBe(40004)
  })
})

// ============================================================================
// 文件 - 头像上传
// ============================================================================
describe('POST /api/v1/file/avatar', () => {
  it('未上传文件返回 40005', async () => {
    const { token } = await registerAndLogin('avu', 'av@test.com')

    const res = await request(app)
      .post('/api/v1/file/avatar')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(40005)
  })

  it('上传 png 返回 200 + avatarUrl', async () => {
    const { token } = await registerAndLogin('avu2', 'av2@test.com')

    // 1×1 PNG 字节流（最小有效 PNG）
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000017352474200aece1ce90000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex',
    )

    const res = await request(app)
      .post('/api/v1/file/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', png, { filename: 'test.png', contentType: 'image/png' })

    expect(res.status).toBe(200)
    expect(res.body.data.avatarUrl).toMatch(/\/uploads\/avatar_/)
  })

  it('不支持的扩展名返回 415 + code=41501', async () => {
    const { token } = await registerAndLogin('avu3', 'av3@test.com')

    const res = await request(app)
      .post('/api/v1/file/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', Buffer.from('fake'), { filename: 'malicious.exe' })

    expect(res.status).toBe(415)
    expect(res.body.code).toBe(41501)
  })
})

// ============================================================================
// 404 处理
// ============================================================================
describe('404 fallback', () => {
  it('未知路由返回 404 + code=40499', async () => {
    const res = await request(app).get('/api/v1/no-such-route')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe(40499)
  })
})
