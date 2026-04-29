import express from 'express';
import cors from 'cors';
import passport from 'passport';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { initOAuthStrategies } from './services/oauth.service.js';

// 路由
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import syncRoutes from './routes/sync.routes.js';
import fileRoutes from './routes/file.routes.js';

/**
 * 创建并配置 Express 应用
 */
export function createApp(): express.Application {
  const app = express();

  // 确保上传目录存在
  const uploadDir = path.resolve(config.uploadDir);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    logger.info({ uploadDir }, '已创建上传目录');
  }

  // ===== 中间件配置 =====

  // CORS - 允许客户端跨域访问
  // 由 config.corsOrigin 控制，默认 '*'（自托管 + Electron 友好；安全由 JWT 保证）。
  // credentials: true 时 cors 会自动把 origin: true 回显请求里的 Origin 头，避免 '*' + credentials 的违规组合。
  const corsOrigin = config.corsOrigin === '*'
    ? true                                          // 任意 origin（cors 库会回显 Origin）
    : config.corsOrigin.split(',').map(s => s.trim()).filter(Boolean);

  app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  // JSON 请求体解析（10MB 上限）
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 通用 API 限流
  app.use('/api/', apiLimiter);

  // Passport 初始化（不使用 session，使用 JWT）
  app.use(passport.initialize());
  initOAuthStrategies();

  // 请求日志（开发环境）
  if (config.isDev) {
    app.use((req, _res, next) => {
      logger.debug({ method: req.method, url: req.url }, '请求');
      next();
    });
  }

  // ===== 静态文件服务 =====
  app.use('/uploads', express.static(uploadDir));

  // ===== 路由注册 =====
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/user', userRoutes);
  app.use('/api/v1/sync', syncRoutes);
  app.use('/api/v1/file', fileRoutes);

  // 健康检查接口
  app.get('/health', (_req, res) => {
    res.json({ code: 0, data: { status: 'ok', env: config.nodeEnv }, message: 'ok' });
  });

  // ===== 错误处理 =====
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
