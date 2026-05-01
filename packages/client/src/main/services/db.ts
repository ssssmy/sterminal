// SQLite 数据库访问层
// 封装 better-sqlite3，提供通用 CRUD 方法

import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { SCHEMA_SQL } from '../database/schema'
import { runMigrations } from '../database/migrations'

let db: Database.Database | null = null

/**
 * 获取数据库文件路径
 * 开发环境: 项目根目录下的 .db 文件
 * 生产环境: userData 目录下
 */
function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'sterminal.db')
}

/**
 * 初始化数据库连接并运行建表 SQL
 */
export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()

  // 确保目录存在
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // 创建/打开数据库
  db = new Database(dbPath)

  // 开启 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 运行建表 SQL（幂等，使用 IF NOT EXISTS）
  db.exec(SCHEMA_SQL)

  // 运行 schema 迁移（追加列、新表）
  runMigrations(db)

  console.log(`[DB] 数据库已初始化: ${dbPath}`)

  return db
}

/**
 * 获取数据库实例（必须先调用 initDatabase）
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error('[DB] 数据库未初始化，请先调用 initDatabase()')
  }
  return db
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ===== 通用 CRUD 工具方法 =====

/**
 * 查询所有记录
 */
export function dbAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T[] {
  const stmt = getDb().prepare(sql)
  return stmt.all(...params) as T[]
}

/**
 * 查询单条记录
 */
export function dbGet<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T | undefined {
  const stmt = getDb().prepare(sql)
  return stmt.get(...params) as T | undefined
}

/**
 * 执行写操作（INSERT / UPDATE / DELETE）
 */
export function dbRun(
  sql: string,
  params: unknown[] = []
): Database.RunResult {
  const stmt = getDb().prepare(sql)
  return stmt.run(...params)
}

/**
 * 在事务中执行多个操作
 */
export function dbTransaction<T>(fn: (db: Database.Database) => T): T {
  const transaction = getDb().transaction(fn)
  return transaction(getDb())
}
