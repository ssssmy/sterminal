// 客户端数据库迁移
//
// SCHEMA_SQL 使用 IF NOT EXISTS 创建表，无法处理升级时新增列的情形。
// 这里通过 PRAGMA table_info 检查列是否存在，缺失则 ALTER TABLE 补齐。
//
// 所有同步表都需要追加 field_meta 列，存储 CRDT 字段级元数据。

import type Database from 'better-sqlite3'

interface ColumnInfo {
  name: string
}

const SYNC_TABLES_NEEDING_FIELD_META = [
  'hosts',
  'host_groups',
  'local_terminals',
  'local_terminal_groups',
  'snippets',
  'snippet_groups',
  'port_forwards',
  'tags',
  'custom_themes',
  'sftp_bookmarks',
  'keys',
  'vault_entries',
]

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
  return cols.some((c) => c.name === column)
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(table) as { name: string } | undefined
  return !!row
}

/**
 * 运行所有需要的 schema 升级。幂等。
 */
export function runMigrations(db: Database.Database): void {
  // 1. 为同步表加 field_meta 列
  for (const table of SYNC_TABLES_NEEDING_FIELD_META) {
    if (!tableExists(db, table)) continue
    if (!hasColumn(db, table, 'field_meta')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN field_meta TEXT`)
    }
  }

  // 2. crdt_tombstones 表（删除事件的逻辑时钟）
  db.exec(`
    CREATE TABLE IF NOT EXISTS crdt_tombstones (
      entity_type TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      ts          TEXT NOT NULL,
      did         TEXT NOT NULL,
      synced      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity_type, entity_id)
    );
  `)
}
