import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * 初始化数据库连接
 * - 自动创建 data/ 目录
 * - 开启 WAL 模式以提升并发性能
 */
function createConnection(): Database.Database {
  // 确保数据目录存在
  const dbDir = path.dirname(path.resolve(config.dbPath));
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info({ dbDir }, '已创建数据库目录');
  }

  const db = new Database(config.dbPath);

  // 开启 WAL 模式（Write-Ahead Logging），提升读写并发
  db.pragma('journal_mode = WAL');
  // 开启外键约束
  db.pragma('foreign_keys = ON');
  // 提升同步性能（生产环境可以考虑 FULL）
  db.pragma('synchronous = NORMAL');

  logger.info({ dbPath: config.dbPath }, '数据库连接已建立');

  return db;
}

/**
 * 全局数据库实例（单例）
 */
export const db = createConnection();

export default db;
