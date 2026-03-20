import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * 认证接口限流器（注册/登录/密码重置等）
 * 默认每分钟最多 5 次
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟窗口
  max: config.rateLimit.auth,
  message: {
    code: 429,
    data: null,
    message: '请求过于频繁，请稍后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 通用 API 限流器
 * 默认每分钟最多 100 次
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.api,
  message: {
    code: 429,
    data: null,
    message: '请求过于频繁，请稍后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 同步接口限流器
 * 默认每分钟最多 30 次
 */
export const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.sync,
  message: {
    code: 429,
    data: null,
    message: '同步请求过于频繁，请稍后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
