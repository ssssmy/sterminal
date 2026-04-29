import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../utils/jwt.js';
import { AppError } from './error-handler.js';
import { ErrorCode } from '../utils/error-codes.js';

/**
 * 让 Passport 的 Express.User 与我们的 JwtPayload 兼容。
 * 这样 req.user 同时满足 passport 的类型期望和业务代码的 userId/sessionId/email 访问。
 */
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends JwtPayload {}
  }
}

/**
 * JWT 认证中间件
 * 从 Authorization: Bearer <token> 头中提取并验证 JWT
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError(ErrorCode.AUTH_TOKEN_MISSING, '未提供认证 Token'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      next(new AppError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token 已过期，请重新登录'));
    } else {
      next(new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'Token 无效，请重新登录'));
    }
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
