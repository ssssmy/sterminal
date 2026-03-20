import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * JWT payload 结构
 */
export interface JwtPayload {
  userId: string;
  sessionId: string;
  email: string;
}

/**
 * 生成 JWT Token
 */
export function signToken(payload: JwtPayload, expiresIn?: string): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: expiresIn ?? config.jwtExpiresIn,
  } as jwt.SignOptions);
}

/**
 * 验证并解析 JWT Token
 * @throws {jwt.JsonWebTokenError} Token 无效
 * @throws {jwt.TokenExpiredError} Token 已过期
 */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  return decoded as JwtPayload;
}

/**
 * 不验证签名，仅解码 Token（用于调试或提取过期 Token 信息）
 */
export function decodeToken(token: string): JwtPayload | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') return null;
  return decoded as JwtPayload;
}
