import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../utils/jwt.js';
import { AppError } from './error-handler.js';

/**
 * 扩展 Express Request 类型，附加已验证的用户信息
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT 认证中间件
 * 从 Authorization: Bearer <token> 头中提取并验证 JWT
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError(401, 401, '未提供认证 Token'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    const message = err instanceof Error && err.name === 'TokenExpiredError'
      ? 'Token 已过期，请重新登录'
      : 'Token 无效，请重新登录';
    next(new AppError(401, 401, message));
  }
}

/**
 * 可选认证中间件
 * Token 存在则验证并附加用户信息，不存在则继续（不报错）
 */
export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyToken(token);
  } catch {
    // 可选认证忽略无效 Token
  }

  next();
}
