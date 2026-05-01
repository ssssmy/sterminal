import db from '../database/connection.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCode } from '../utils/error-codes.js';
import { logger } from '../utils/logger.js';
import {
  mergeCrdt,
  isAlive,
  parseFieldMeta,
  serializeFieldMeta,
  type CrdtState,
  type FieldMeta,
  type Tick,
} from './crdt-merge.js';
import type { PushSyncInput, PullSyncQuery } from '../validators/sync.schema.js';

/** ISO datetime → SQLite datetime (2024-01-01T00:00:00.000Z → 2024-01-01 00:00:00) */
function toSqliteTime(t: string): string {
  return t.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');
}

function toIsoTime(t: string): string {
  if (t.includes('T')) return t;
  return t.replace(' ', 'T') + '.000Z';
}

/**
 * 同步实体记录类型（DB 行）
 */
export interface SyncEntityRecord {
  id: string;
  user_id: string;
  entity_type: string;
  data: string;                     // JSON-serialized fields
  field_meta: string | null;        // JSON-serialized field clocks
  version: number;
  deleted: number;
  tombstone_ts: string | null;
  tombstone_did: string | null;
  updated_at: string;
  created_at: string;
}

function maxTs(meta: FieldMeta, tombstone: Tick | null): string {
  let max = '1970-01-01T00:00:00.000Z';
  for (const m of Object.values(meta)) {
    if (m.ts > max) max = m.ts;
  }
  if (tombstone && tombstone.ts > max) max = tombstone.ts;
  return max;
}

function rowToCrdtState(row: SyncEntityRecord): CrdtState {
  let fields: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.data);
    if (parsed && typeof parsed === 'object') fields = parsed as Record<string, unknown>;
  } catch { /* ignore */ }
  const fieldMeta = parseFieldMeta(row.field_meta);
  const tombstone: Tick | null =
    row.tombstone_ts && row.tombstone_did
      ? { ts: row.tombstone_ts, did: row.tombstone_did }
      : null;
  return { fields, fieldMeta, tombstone };
}

/**
 * 推送同步数据（客户端 → 服务端）
 *
 * CRDT 合并：每个实体读取服务端现状 → mergeCrdt(local, remote) → 写回
 * 每次合并都强制 +1 version 并刷新 updated_at，确保其他设备能拉到最新版本。
 * 不再产生 conflicts —— CRDT 永不冲突。
 */
export function pushSync(userId: string, input: PushSyncInput): {
  accepted: number;
  conflicts: string[];
} {
  let accepted = 0;

  const tx = db.transaction(() => {
    for (const entity of input.entities) {
      const remoteState: CrdtState = {
        fields: entity.fields,
        fieldMeta: entity.fieldMeta,
        tombstone: entity.tombstone ?? null,
      };

      const existing = db.prepare(`
        SELECT * FROM sync_entities
        WHERE user_id = ? AND entity_type = ? AND id = ?
      `).get(userId, entity.entityType, entity.id) as SyncEntityRecord | undefined;

      const localState: CrdtState | null = existing ? rowToCrdtState(existing) : null;
      const merged = mergeCrdt(localState, remoteState);
      const dead = !isAlive(merged);

      const newVersion = (existing?.version ?? 0) + 1;
      const newUpdatedAt = toSqliteTime(maxTs(merged.fieldMeta, merged.tombstone));

      const dataJson = JSON.stringify(merged.fields);
      const fieldMetaJson = serializeFieldMeta(merged.fieldMeta);
      const tombTs = merged.tombstone?.ts ?? null;
      const tombDid = merged.tombstone?.did ?? null;

      if (existing) {
        db.prepare(`
          UPDATE sync_entities
          SET data = ?, field_meta = ?, version = ?, deleted = ?,
              tombstone_ts = ?, tombstone_did = ?, updated_at = ?
          WHERE user_id = ? AND entity_type = ? AND id = ?
        `).run(
          dataJson, fieldMetaJson, newVersion, dead ? 1 : 0,
          tombTs, tombDid, newUpdatedAt,
          userId, entity.entityType, entity.id,
        );
      } else {
        db.prepare(`
          INSERT INTO sync_entities (id, user_id, entity_type, data, field_meta, version, deleted, tombstone_ts, tombstone_did, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          entity.id, userId, entity.entityType, dataJson, fieldMetaJson,
          newVersion, dead ? 1 : 0, tombTs, tombDid, newUpdatedAt,
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

  logger.debug({ userId, accepted }, '同步数据推送完成（CRDT 合并）');

  // 兼容旧返回结构：conflicts 永远空数组
  return { accepted, conflicts: [] };
}

/**
 * 拉取同步数据（服务端 → 客户端）
 *
 * 返回 CRDT 表示：fields + field_meta + tombstone_ts/did + updated_at。
 */
export interface PullEntity {
  id: string;
  entity_type: string;
  fields: Record<string, unknown>;
  field_meta: FieldMeta;
  tombstone_ts: string | null;
  tombstone_did: string | null;
  updated_at: string;
}

export function pullSync(userId: string, query: PullSyncQuery): {
  entities: PullEntity[];
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

  const rows = db.prepare(`
    SELECT * FROM sync_entities
    WHERE ${conditions.join(' AND ')}
    ORDER BY updated_at ASC
    LIMIT ?
  `).all(...params) as SyncEntityRecord[];

  const hasMore = rows.length > query.limit;
  const slice = hasMore ? rows.slice(0, query.limit) : rows;
  const nextSince = slice.length > 0 ? toIsoTime(slice[slice.length - 1].updated_at) : toIsoTime(since);

  const entities: PullEntity[] = slice.map((row) => {
    let fields: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.data);
      if (parsed && typeof parsed === 'object') fields = parsed as Record<string, unknown>;
    } catch { /* ignore */ }
    return {
      id: row.id,
      entity_type: row.entity_type,
      fields,
      field_meta: parseFieldMeta(row.field_meta),
      tombstone_ts: row.tombstone_ts,
      tombstone_did: row.tombstone_did,
      updated_at: toIsoTime(row.updated_at),
    };
  });

  return { entities, hasMore, nextSince };
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
 * 直接删除指定实体（管理 API 用，普通客户端走 push tombstone 路径）
 */
export function deleteEntity(userId: string, entityType: string, entityId: string): void {
  const result = db.prepare(`
    UPDATE sync_entities
    SET deleted = 1,
        tombstone_ts = datetime('now'),
        tombstone_did = 'admin',
        updated_at = datetime('now'),
        version = version + 1
    WHERE user_id = ? AND entity_type = ? AND id = ?
  `).run(userId, entityType, entityId);

  if (result.changes === 0) {
    throw new AppError(ErrorCode.SYNC_ENTITY_NOT_FOUND, '同步实体不存在');
  }
}

/**
 * 全量拉取该用户所有未删除实体（新设备首次同步）
 */
export function pullFullSync(userId: string, limit = 1000, offset = 0): {
  entities: PullEntity[];
  total: number;
  hasMore: boolean;
} {
  const totalRow = db.prepare(`
    SELECT COUNT(*) as count FROM sync_entities
    WHERE user_id = ? AND deleted = 0
  `).get(userId) as { count: number };

  const rows = db.prepare(`
    SELECT * FROM sync_entities
    WHERE user_id = ? AND deleted = 0
    ORDER BY entity_type ASC, updated_at ASC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset) as SyncEntityRecord[];

  const entities: PullEntity[] = rows.map((row) => {
    let fields: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.data);
      if (parsed && typeof parsed === 'object') fields = parsed as Record<string, unknown>;
    } catch { /* ignore */ }
    return {
      id: row.id,
      entity_type: row.entity_type,
      fields,
      field_meta: parseFieldMeta(row.field_meta),
      tombstone_ts: row.tombstone_ts,
      tombstone_did: row.tombstone_did,
      updated_at: toIsoTime(row.updated_at),
    };
  });

  return {
    entities,
    total: totalRow.count,
    hasMore: offset + entities.length < totalRow.count,
  };
}

/**
 * 重置该用户全部同步数据
 */
export function resetSync(userId: string): { entitiesDeleted: number; cursorsDeleted: number } {
  let entitiesDeleted = 0;
  let cursorsDeleted = 0;

  const tx = db.transaction(() => {
    const r1 = db.prepare('DELETE FROM sync_entities WHERE user_id = ?').run(userId);
    entitiesDeleted = r1.changes;

    const r2 = db.prepare('DELETE FROM sync_cursors WHERE user_id = ?').run(userId);
    cursorsDeleted = r2.changes;

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
