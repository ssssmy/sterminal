// CRDT 写入辅助函数
//
// 业务侧 INSERT / UPDATE / DELETE 通过这里维护 field_meta 与 crdt_tombstones，
// 让本地写入也带上字段级时钟印记，否则同步引擎在 push 阶段无法生成正确的 meta。

import { dbGet, dbRun } from './db'
import { crdtClock } from './crdt-clock'
import { bumpFieldMeta, parseFieldMeta, serializeFieldMeta, type FieldMeta } from './crdt-merge'

/**
 * 在 INSERT 之后调用，给所有写入字段打上当前 tick。
 *
 * @param table        SQLite 表名（必须有 field_meta 列）
 * @param idColumn     主键列名（如 'id' / 'action' / 'key'）
 * @param idValue      主键值
 * @param writtenCols  本次 INSERT 显式写入的列名集合（用于打标）
 */
export function stampInsert(
  table: string,
  idColumn: string,
  idValue: string,
  writtenCols: string[]
): void {
  const tick = crdtClock.now()
  const meta = bumpFieldMeta({}, writtenCols, tick)
  dbRun(
    `UPDATE ${table} SET field_meta = ? WHERE ${idColumn} = ?`,
    [serializeFieldMeta(meta), idValue]
  )
}

/**
 * 在 UPDATE 之后调用，将本次变更的列打上当前 tick。
 * 已存在的 meta 保留，未变更字段的 tick 不动。
 */
export function stampUpdate(
  table: string,
  idColumn: string,
  idValue: string,
  changedCols: string[]
): void {
  if (changedCols.length === 0) return
  const row = dbGet<{ field_meta: string | null }>(
    `SELECT field_meta FROM ${table} WHERE ${idColumn} = ?`,
    [idValue]
  )
  const oldMeta: FieldMeta = parseFieldMeta(row?.field_meta ?? null)
  const tick = crdtClock.now()
  const newMeta = bumpFieldMeta(oldMeta, changedCols, tick)
  dbRun(
    `UPDATE ${table} SET field_meta = ? WHERE ${idColumn} = ?`,
    [serializeFieldMeta(newMeta), idValue]
  )
}

/**
 * 记录 tombstone：实体删除事件的逻辑时钟。
 * 调用方应在 DELETE 业务表行后立即调用。
 */
export function stampTombstone(entityType: string, entityId: string): void {
  const tick = crdtClock.now()
  dbRun(
    `INSERT INTO crdt_tombstones (entity_type, entity_id, ts, did, synced)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       ts = excluded.ts, did = excluded.did, synced = 0`,
    [entityType, entityId, tick.ts, tick.did]
  )
}
