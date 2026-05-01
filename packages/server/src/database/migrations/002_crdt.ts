import type Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';

/**
 * 002_crdt
 *
 * 为 sync_entities 加 CRDT 字段：
 *   - field_meta:    {字段名 -> {ts, did}} JSON，用于字段级 LWW 合并
 *   - tombstone_ts:  删除事件的 ISO 时间戳
 *   - tombstone_did: 删除事件的设备 ID
 *
 * 旧的 deleted/version/updated_at 列继续保留，便于回滚和兼容旧客户端。
 * CRDT 合并将基于 field_meta + tombstone 推导得到 deleted 与 updated_at。
 */
export function up(db: Database.Database): void {
  // 已应用则跳过
  const applied = db.prepare(
    'SELECT name FROM migrations WHERE name = ?'
  ).get('002_crdt') as { name: string } | undefined;
  if (applied) {
    logger.info('迁移 002_crdt 已应用，跳过');
    return;
  }

  db.exec(`
    ALTER TABLE sync_entities ADD COLUMN field_meta TEXT;
    ALTER TABLE sync_entities ADD COLUMN tombstone_ts TEXT;
    ALTER TABLE sync_entities ADD COLUMN tombstone_did TEXT;
  `);

  db.prepare('INSERT INTO migrations (name) VALUES (?)').run('002_crdt');
  logger.info('迁移 002_crdt 执行完成');
}

export function down(db: Database.Database): void {
  // SQLite 不支持 DROP COLUMN（旧版），使用重建表方式
  db.exec(`
    BEGIN TRANSACTION;
    CREATE TABLE sync_entities_old AS SELECT
      id, user_id, entity_type, data, version, deleted, updated_at, created_at
      FROM sync_entities;
    DROP TABLE sync_entities;
    CREATE TABLE sync_entities (
      id              TEXT NOT NULL,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type     TEXT NOT NULL,
      data            TEXT NOT NULL,
      version         INTEGER NOT NULL DEFAULT 1,
      deleted         INTEGER NOT NULL DEFAULT 0,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, entity_type, id)
    );
    INSERT INTO sync_entities SELECT * FROM sync_entities_old;
    DROP TABLE sync_entities_old;
    DELETE FROM migrations WHERE name = '002_crdt';
    COMMIT;
  `);
  logger.info('迁移 002_crdt 已回滚');
}
