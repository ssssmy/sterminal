import 'dotenv/config';

/**
 * 应用配置 - 从环境变量读取，提供默认值
 */
export const config = {
  // 服务配置
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3001',

  // 数据库
  dbPath: process.env.DB_PATH ?? './data/sterminal.db',

  // JWT
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-please-change-in-production',
  jwtExpiresIn: '7d',
  jwtRefreshExpiresIn: '30d',

  // 邮件服务
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'STerminal <no-reply@example.com>',
  },

  // OAuth - GitHub
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    callbackUrl: `${process.env.BASE_URL ?? 'http://localhost:3001'}/api/v1/auth/github/callback`,
  },

  // OAuth - Google
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: `${process.env.BASE_URL ?? 'http://localhost:3001'}/api/v1/auth/google/callback`,
  },

  // 文件上传
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',

  // 限流（每分钟最大请求数）
  rateLimit: {
    auth: parseInt(process.env.RATE_LIMIT_AUTH ?? '5', 10),
    api: parseInt(process.env.RATE_LIMIT_API ?? '100', 10),
    sync: parseInt(process.env.RATE_LIMIT_SYNC ?? '30', 10),
  },

  // 是否为开发环境
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
} as const;

export type Config = typeof config;
