import db from '../database/connection.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import type { PushSyncInput, PullSyncQuery } from '../validators/sync.schema.js';

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

  // 统一时间格式为 SQLite datetime
  const normalizeTime = (t: string) => t.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');

  const tx = db.transaction(() => {
    for (const entity of input.entities) {
      const updatedAt = normalizeTime(entity.updatedAt);

      const existing = db.prepare(`
        SELECT version FROM sync_entities
        WHERE user_id = ? AND entity_type = ? AND id = ?
      `).get(userId, entity.entityType, entity.id) as { version: number } | undefined;

      if (existing && entity.version !== existing.version + 1) {
        conflicts.push(entity.id);
        continue;
      }

      if (existing) {
        db.prepare(`
          UPDATE sync_entities
          SET data = ?, version = ?, deleted = ?, updated_at = ?
          WHERE user_id = ? AND entity_type = ? AND id = ?
        `).run(
          entity.data,
          entity.version,
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
  // 统一转为 SQLite datetime 格式进行比较
  const rawSince = query.since ?? '1970-01-01 00:00:00';
  const since = rawSince.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');

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
    throw new AppError(404, 404, '同步实体不存在');
  }
}
