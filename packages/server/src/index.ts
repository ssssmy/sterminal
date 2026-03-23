import http from 'http';
import { createApp } from './app.js';
import { createWsServer } from './websocket/ws-server.js';
import db from './database/connection.js';
import { up as runInitialMigration } from './database/migrations/001_initial.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

/**
 * 运行数据库迁移
 */
function runMigrations(): void {
  try {
    runInitialMigration(db);
    logger.info('数据库迁移完成');
  } catch (err) {
    logger.error({ err }, '数据库迁移失败');
    process.exit(1);
  }
}

/**
 * 启动服务器
 */
async function start(): Promise<void> {
  // 1. 运行数据库迁移
  runMigrations();

  // 2. 创建 Express 应用
  const app = createApp();

  // 3. 创建 HTTP Server
  const httpServer = http.createServer(app);

  // 4. 启动 WebSocket 服务
  createWsServer(httpServer);

  // 5. 监听端口
  const host = config.isDev ? '0.0.0.0' : '127.0.0.1';
  httpServer.listen(config.port, host, () => {
    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        baseUrl: config.baseUrl,
      },
      `STerminal 后端服务已启动`,
    );
  });

  // ===== 优雅关闭 =====
  const shutdown = (signal: string) => {
    logger.info({ signal }, '收到关闭信号，开始优雅关闭...');

    httpServer.close(() => {
      logger.info('HTTP 服务器已关闭');

      // 关闭数据库连接
      db.close();
      logger.info('数据库连接已关闭');

      logger.info('服务器已优雅关闭');
      process.exit(0);
    });

    // 强制关闭超时（10秒）
    setTimeout(() => {
      logger.error('强制关闭超时，强制退出');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // 未捕获的异常
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, '未捕获的异常');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, '未处理的 Promise 拒绝');
    process.exit(1);
  });
}

start().catch((err) => {
  logger.fatal({ err }, '服务器启动失败');
  process.exit(1);
});
