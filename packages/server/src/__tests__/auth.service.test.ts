import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest'

// ── 创建内存数据库（在 vi.mock 之前通过 vi.hoisted 初始化）─────────────────
const testDb = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Db = require('better-sqlite3') as typeof import('better-sqlite3').default
  const db = new Db(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
})

// ── 替换数据库模块 ────────────────────────────────────────────────────────────
vi.mock('../database/connection.js', () => ({
  default: testDb,
  db: testDb,
}))

// ── 屏蔽邮件服务（避免 SMTP 连接） ───────────────────────────────────────────
vi.mock('../services/email.service.js', () => ({
  sendVerifyEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

// ── 导入被测模块（在 mock 之后） ──────────────────────────────────────────────
import { up } from '../database/migrations/001_initial.js'
import * as authService from '../services/auth.service.js'

// ── 建表 ─────────────────────────────────────────────────────────────────────
beforeAll(() => {
  up(testDb)
})

// ── 每个测试后清理用户/会话数据 ───────────────────────────────────────────────
afterEach(() => {
  testDb.exec(`
    DELETE FROM sessions;
    DELETE FROM login_attempts;
    DELETE FROM password_resets;
    DELETE FROM users;
  `)
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService.register', () => {
  it('成功注册并返回 token 和用户信息', async () => {
    const result = await authService.register({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1!',
    })

    expect(result.token).toBeTruthy()
    expect(result.user.username).toBe('testuser')
    expect(result.user.email).toBe('test@example.com')
    // 不应包含密码哈希和验证 token
    expect(result.user).not.toHaveProperty('password_hash')
    expect(result.user).not.toHaveProperty('verify_token')
  })

  it('注册后 sessions 表中存在对应会话', async () => {
    const result = await authService.register({
      username: 'testuser2',
      email: 'test2@example.com',
      password: 'Password1!',
    })

    const session = testDb
      .prepare('SELECT * FROM sessions WHERE user_id = ?')
      .get(result.user.id)
    expect(session).toBeTruthy()
  })

  it('邮箱重复时抛出 409 错误', async () => {
    await authService.register({
      username: 'user1',
      email: 'dup@example.com',
      password: 'Password1!',
    })

    await expect(
      authService.register({
        username: 'user2',
        email: 'dup@example.com',
        password: 'Password1!',
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 40901 })
  })

  it('用户名重复时抛出 409 错误', async () => {
    await authService.register({
      username: 'dupname',
      email: 'a@example.com',
      password: 'Password1!',
    })

    await expect(
      authService.register({
        username: 'dupname',
        email: 'b@example.com',
        password: 'Password1!',
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 40902 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService.login', () => {
  async function createUser(email = 'login@example.com', password = 'Password1!') {
    return authService.register({ username: 'loginuser', email, password })
  }

  it('正确凭证登录成功并返回 token', async () => {
    await createUser()
    const result = await authService.login({ email: 'login@example.com', password: 'Password1!' })

    expect(result.token).toBeTruthy()
    expect(result.user.email).toBe('login@example.com')
  })

  it('密码错误时抛出 401 错误', async () => {
    await createUser()
    await expect(
      authService.login({ email: 'login@example.com', password: 'WrongPass1!' })
    ).rejects.toMatchObject({ statusCode: 401, code: 40101 })
  })

  it('邮箱不存在时抛出 401 错误', async () => {
    await expect(
      authService.login({ email: 'nobody@example.com', password: 'Password1!' })
    ).rejects.toMatchObject({ statusCode: 401, code: 40101 })
  })

  it('remember=true 时会话有效期为 30 天', async () => {
    await createUser()
    const { token } = await authService.login({
      email: 'login@example.com',
      password: 'Password1!',
      remember: true,
    })

    // 用 token_hash 精确定位本次登录会话，避免与 register 会话混淆
    const { sha256 } = await import('../utils/hash.js')
    const session = testDb
      .prepare('SELECT expires_at FROM sessions WHERE token_hash = ?')
      .get(sha256(token)) as { expires_at: string }

    const expires = new Date(session.expires_at)
    const diffDays = (expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(25)
  })

  it('登录失败次数过多后触发限流（PRD 5次/15分钟）', async () => {
    await createUser('limit@example.com')

    // 插入 5 条失败记录（达到 PRD 锁定阈值）
    for (let i = 0; i < 5; i++) {
      testDb
        .prepare(`INSERT INTO login_attempts (id, email, ip_address, success) VALUES (?, ?, NULL, 0)`)
        .run(`attempt-${i}`, 'limit@example.com')
    }

    await expect(
      authService.login({ email: 'limit@example.com', password: 'Password1!' })
    ).rejects.toMatchObject({ statusCode: 429, code: 42901 })
  })

  it('登录失败 4 次未触发限流（低于阈值）', async () => {
    await createUser('limit2@example.com')

    for (let i = 0; i < 4; i++) {
      testDb
        .prepare(`INSERT INTO login_attempts (id, email, ip_address, success) VALUES (?, ?, NULL, 0)`)
        .run(`attempt2-${i}`, 'limit2@example.com')
    }

    // 用正确密码应能登录成功
    const result = await authService.login({ email: 'limit2@example.com', password: 'Password1!' })
    expect(result.token).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService.logout', () => {
  it('退出登录后会话被删除', async () => {
    const { token, user } = await authService.register({
      username: 'logoutuser',
      email: 'logout@example.com',
      password: 'Password1!',
    })

    const { sha256 } = await import('../utils/hash.js')
    authService.logout(sha256(token))

    const session = testDb
      .prepare('SELECT * FROM sessions WHERE user_id = ?')
      .get(user.id)
    expect(session).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService.verifyEmail', () => {
  it('有效 token 验证成功', async () => {
    await authService.register({
      username: 'verifyuser',
      email: 'verify@example.com',
      password: 'Password1!',
    })

    const user = testDb
      .prepare('SELECT verify_token FROM users WHERE email = ?')
      .get('verify@example.com') as { verify_token: string }

    expect(() => authService.verifyEmail(user.verify_token)).not.toThrow()

    const updated = testDb
      .prepare('SELECT email_verified FROM users WHERE email = ?')
      .get('verify@example.com') as { email_verified: number }
    expect(updated.email_verified).toBe(1)
  })

  it('无效 token 抛出 400 错误', () => {
    expect(() => authService.verifyEmail('invalid-token')).toThrow()
  })
})
