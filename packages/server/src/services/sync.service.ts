import db from '../database/connection.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCode } from '../utils/error-codes.js';
import { logger } from '../utils/logger.js';
import type { PushSyncInput, PullSyncQuery } from '../validators/sync.schema.js';

/** ISO datetime → SQLite datetime (2024-01-01T00:00:00.000Z → 2024-01-01 00:00:00) */
function toSqliteTime(t: string): string {
  return t.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');
}

/**
 * 同步实体记录类型
 */
export interface SyncEntityRecord {
  id: string;
  user_id: string;
  entity_type: string;
  data: string;
  version: number;
  deleted: number;
  updated_at: string;
  created_at: string;
}

/**
 * 推送同步数据（客户端 → 服务端）
 * 使用乐观锁：version 必须等于服务端当前 version + 1
 */
export function pushSync(userId: string, input: PushSyncInput): {
  accepted: number;
  conflicts: string[];
} {
  let accepted = 0;
  const conflicts: string[] = [];

  const tx = db.transaction(() => {
    for (const entity of input.entities) {
      const updatedAt = toSqliteTime(entity.updatedAt);

      const existing = db.prepare(`
        SELECT version FROM sync_entities
        WHERE user_id = ? AND entity_type = ? AND id = ?
      `).get(userId, entity.entityType, entity.id) as { version: number } | undefined;

      // 删除操作跳过版本检查（允许任意版本删除）
      if (existing && !entity.deleted && entity.version !== existing.version + 1) {
        conflicts.push(entity.id);
        continue;
      }

      if (existing) {
        // 删除操作强制递增版本号确保其他设备能拉到变更
        const newVersion = entity.deleted ? existing.version + 1 : entity.version;
        db.prepare(`
          UPDATE sync_entities
          SET data = ?, version = ?, deleted = ?, updated_at = ?
          WHERE user_id = ? AND entity_type = ? AND id = ?
        `).run(
          entity.data,
          newVersion,
          entity.deleted ? 1 : 0,
          updatedAt,
          userId,
          entity.entityType,
          entity.id,
        );
      } else {
        db.prepare(`
          INSERT INTO sync_entities (id, user_id, entity_type, data, version, deleted, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          entity.id,
          userId,
          entity.entityType,
          entity.data,
          entity.version,
          entity.deleted ? 1 : 0,
          updatedAt,
        );
      }

      accepted++;
    }

    // 更新设备同步游标
    db.prepare(`
      INSERT INTO sync_cursors (user_id, device_id, last_sync_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id, device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at
    `).run(userId, input.deviceId);
  });

  tx();

  logger.debug({ userId, accepted, conflicts: conflicts.length }, '同步数据推送完成');

  return { accepted, conflicts };
}

/**
 * 拉取同步数据（服务端 → 客户端）
 */
export function pullSync(userId: string, query: PullSyncQuery): {
  entities: SyncEntityRecord[];
  hasMore: boolean;
  nextSince: string;
} {
  const since = toSqliteTime(query.since ?? '1970-01-01 00:00:00');

  const conditions = ['user_id = ?', 'updated_at > ?'];
  const params: unknown[] = [userId, since];

  if (query.entityType) {
    conditions.push('entity_type = ?');
    params.push(query.entityType);
  }

  params.push(query.limit + 1);

  const entities = db.prepare(`
    SELECT * FROM sync_entities
    WHERE ${conditions.join(' AND ')}
    ORDER BY updated_at ASC
    LIMIT ?
  `).all(...params) as SyncEntityRecord[];

  const hasMore = entities.length > query.limit;
  const result = hasMore ? entities.slice(0, query.limit) : entities;
  const nextSince = result.length > 0 ? result[result.length - 1].updated_at : since;

  return { entities: result, hasMore, nextSince };
}

/**
 * 获取用户的同步游标列表
 */
export function getSyncCursors(userId: string): Array<{
  deviceId: string;
  lastSyncAt: string;
}> {
  const cursors = db.prepare(`
    SELECT device_id, last_sync_at FROM sync_cursors WHERE user_id = ?
  `).all(userId) as Array<{ device_id: string; last_sync_at: string }>;

  return cursors.map(c => ({
    deviceId: c.device_id,
    lastSyncAt: c.last_sync_at,
  }));
}

/**
 * 删除指定实体（软删除）
 */
export function deleteEntity(userId: string, entityType: string, entityId: string): void {
  const result = db.prepare(`
    UPDATE sync_entities
    SET deleted = 1, updated_at = datetime('now'), version = version + 1
    WHERE user_id = ? AND entity_type = ? AND id = ?
  `).run(userId, entityType, entityId);

  if (result.changes === 0) {
    throw new AppError(ErrorCode.SYNC_ENTITY_NOT_FOUND, '同步实体不存在');
  }
}

/**
 * 全量拉取该用户所有未删除实体（用于新设备首次同步或重建本地）
 * 不带 since 游标，但支持分页避免单次响应过大
 */
export function pullFullSync(userId: string, limit = 1000, offset = 0): {
  entities: SyncEntityRecord[];
  total: number;
  hasMore: boolean;
} {
  const totalRow = db.prepare(`
    SELECT COUNT(*) as count FROM sync_entities
    WHERE user_id = ? AND deleted = 0
  `).get(userId) as { count: number };

  const entities = db.prepare(`
    SELECT * FROM sync_entities
    WHERE user_id = ? AND deleted = 0
    ORDER BY entity_type ASC, updated_at ASC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset) as SyncEntityRecord[];

  return {
    entities,
    total: totalRow.count,
    hasMore: offset + entities.length < totalRow.count,
  };
}

/**
 * 重置该用户全部同步数据（清空 sync_entities + sync_cursors，
 * 同时清除 encryption_salt 让客户端可以重新设置 E2EE 密钥）
 *
 * ⚠️  破坏性操作，调用方需在控制器层做密码二次确认
 */
export function resetSync(userId: string): { entitiesDeleted: number; cursorsDeleted: number } {
  let entitiesDeleted = 0;
  let cursorsDeleted = 0;

  const tx = db.transaction(() => {
    const r1 = db.prepare('DELETE FROM sync_entities WHERE user_id = ?').run(userId);
    entitiesDeleted = r1.changes;

    const r2 = db.prepare('DELETE FROM sync_cursors WHERE user_id = ?').run(userId);
    cursorsDeleted = r2.changes;

    // 清除加密 salt：用户重置后需要重新设置 E2EE
    db.prepare(`
      UPDATE users SET encryption_salt = NULL, updated_at = datetime('now') WHERE id = ?
    `).run(userId);
  });

  tx();

  logger.info({ userId, entitiesDeleted, cursorsDeleted }, '同步数据已重置');

  return { entitiesDeleted, cursorsDeleted };
}

/**
 * 获取用户的 E2EE 加密状态
 */
export function getEncryptionStatus(userId: string): {
  hasEncryption: boolean;
  salt: string | null;
} {
  const user = db.prepare(
    'SELECT encryption_salt FROM users WHERE id = ?'
  ).get(userId) as { encryption_salt: string | null } | undefined;

  if (!user) {
    throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在');
  }

  return {
    hasEncryption: user.encryption_salt !== null,
    salt: user.encryption_salt,
  };
}

/**
 * 设置 E2EE 加密 salt（首次启用加密时调用）
 *
 * 与 user.service.setEncryptionSalt 行为一致：
 * 已设置过的盐值不能直接覆盖，必须先调用 resetSync 清除
 */
export function setEncryptionSalt(userId: string, salt: string): void {
  const user = db.prepare(
    'SELECT encryption_salt FROM users WHERE id = ?'
  ).get(userId) as { encryption_salt: string | null } | undefined;

  if (!user) {
    throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在');
  }

  if (user.encryption_salt) {
    throw new AppError(
      ErrorCode.SYNC_SALT_ALREADY_SET,
      '加密盐值已设置；如需更换请先调用 /sync/reset 清空同步数据',
    );
  }

  db.prepare(`
    UPDATE users SET encryption_salt = ?, updated_at = datetime('now') WHERE id = ?
  `).run(salt, userId);

  logger.info({ userId }, 'E2EE 加密 salt 已设置');
}
