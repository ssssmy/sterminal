import type Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

/**
 * 初始迁移 - 创建所有服务端表
 */
export function up(db: Database.Database): void {
  db.exec(`
    -- ============================================================
    -- 迁移版本记录表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ============================================================
    -- 用户表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,               -- UUID v4
      username        TEXT NOT NULL UNIQUE,
      email           TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,                   -- Argon2id
      avatar_url      TEXT,
      email_verified  INTEGER NOT NULL DEFAULT 0,      -- 0/1
      verify_token    TEXT,
      verify_expires  TEXT,                             -- ISO 8601
      oauth_provider  TEXT,                             -- 'github' | 'google' | NULL
      oauth_id        TEXT,
      encryption_salt TEXT,                             -- 端到端加密盐值（用户首次设置）
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id)
      WHERE oauth_provider IS NOT NULL;

    -- ============================================================
    -- 会话 / Token 表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash      TEXT NOT NULL,                   -- SHA256(JWT)
      device_name     TEXT,
      ip_address      TEXT,
      remember        INTEGER NOT NULL DEFAULT 1,
      expires_at      TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- ============================================================
    -- 密码重置表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS password_resets (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash      TEXT NOT NULL,
      expires_at      TEXT NOT NULL,
      used            INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ============================================================
    -- 登录失败记录（限流锁定用）
    -- ============================================================
    CREATE TABLE IF NOT EXISTS login_attempts (
      id              TEXT PRIMARY KEY,
      email           TEXT NOT NULL,
      ip_address      TEXT,
      success         INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);

    -- ============================================================
    -- 同步数据存储（所有同步数据的统一存储）
    -- ============================================================
    CREATE TABLE IF NOT EXISTS sync_entities (
      id              TEXT NOT NULL,                   -- 实体 UUID
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type     TEXT NOT NULL,                   -- 'host'|'host_group'|'local_terminal'|'snippet'|'snippet_group'|'port_forward'|'key'|'known_host'|'vault_entry'|'tag'|'settings'|'terminal_theme'
      data            TEXT NOT NULL,                   -- JSON (敏感字段已由客户端 E2EE 加密)
      version         INTEGER NOT NULL DEFAULT 1,      -- 乐观锁版本号
      deleted         INTEGER NOT NULL DEFAULT 0,      -- 软删除
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, entity_type, id)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_entities_updated ON sync_entities(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_sync_entities_type ON sync_entities(user_id, entity_type);

    -- ============================================================
    -- 同步版本游标（每个用户每个设备的同步位点）
    -- ============================================================
    CREATE TABLE IF NOT EXISTS sync_cursors (
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id       TEXT NOT NULL,
      last_sync_at    TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z',
      PRIMARY KEY (user_id, device_id)
    );
  `);

  // 记录迁移已应用
  db.prepare(
    `INSERT OR IGNORE INTO migrations (name) VALUES (?)`
  ).run('001_initial');

  logger.info('迁移 001_initial 执行完成');
}

/**
 * 回滚迁移（仅开发环境使用）
 */
export function down(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS sync_cursors;
    DROP TABLE IF EXISTS sync_entities;
    DROP TABLE IF EXISTS login_attempts;
    DROP TABLE IF EXISTS password_resets;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS migrations;
  `);
  logger.info('迁移 001_initial 已回滚');
}
