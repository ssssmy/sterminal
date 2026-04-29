import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection.js';
import { hashPassword, verifyPassword, sha256 } from '../utils/hash.js';
import { signToken } from '../utils/jwt.js';
import { sendVerifyEmail, sendPasswordResetEmail } from './email.service.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCode } from '../utils/error-codes.js';
import { logger } from '../utils/logger.js';
import type { RegisterInput, LoginInput } from '../validators/auth.schema.js';

/** 登录锁定参数（PRD：5 次/15 分钟） */
const LOGIN_LOCK_WINDOW_MINUTES = 15;
const LOGIN_LOCK_MAX_FAILS = 5;

/**
 * 用户数据库记录类型
 */
export interface UserRecord {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  email_verified: number;
  verify_token: string | null;
  verify_expires: string | null;
  oauth_provider: string | null;
  oauth_id: string | null;
  encryption_salt: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 注册新用户
 */
export async function register(input: RegisterInput, ipAddress?: string): Promise<{ token: string; user: Omit<UserRecord, 'password_hash' | 'verify_token'> }> {
  // 检查邮箱是否已注册
  const existingByEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(input.email);
  if (existingByEmail) {
    throw new AppError(ErrorCode.USER_EMAIL_EXISTS, '该邮箱已被注册');
  }

  // 检查用户名是否已占用
  const existingByUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(input.username);
  if (existingByUsername) {
    throw new AppError(ErrorCode.USER_USERNAME_EXISTS, '该用户名已被占用');
  }

  const userId = uuidv4();
  const passwordHash = await hashPassword(input.password);
  const verifyToken = uuidv4();
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // 插入用户
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, verify_token, verify_expires)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, input.username, input.email, passwordHash, verifyToken, verifyExpires);

  // 发送验证邮件（异步，不阻塞响应）
  sendVerifyEmail(input.email, input.username, verifyToken).catch(err => {
    logger.error({ err, userId }, '发送验证邮件失败');
  });

  // 创建会话
  const sessionId = uuidv4();
  const jwtToken = signToken({ userId, sessionId, email: input.email });
  const tokenHash = sha256(jwtToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, tokenHash, ipAddress ?? null, expiresAt);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRecord;
  const { password_hash, verify_token, ...safeUser } = user;

  logger.info({ userId, email: input.email }, '新用户注册成功');

  return { token: jwtToken, user: safeUser };
}

/**
 * 用户登录
 */
export async function login(input: LoginInput, ipAddress?: string): Promise<{ token: string; user: Omit<UserRecord, 'password_hash' | 'verify_token'> }> {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(input.email) as UserRecord | undefined;

  // 记录登录尝试
  const attemptId = uuidv4();
  const recordAttempt = (success: boolean) => {
    db.prepare(`
      INSERT INTO login_attempts (id, email, ip_address, success)
      VALUES (?, ?, ?, ?)
    `).run(attemptId, input.email, ipAddress ?? null, success ? 1 : 0);
  };

  if (!user) {
    recordAttempt(false);
    throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '邮箱或密码错误');
  }

  // 检查近期登录失败次数（PRD：15 分钟内 5 次失败锁定）
  const recentFails = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE email = ? AND success = 0
    AND created_at > datetime('now', '-${LOGIN_LOCK_WINDOW_MINUTES} minutes')
  `).get(input.email) as { count: number };

  if (recentFails.count >= LOGIN_LOCK_MAX_FAILS) {
    throw new AppError(
      ErrorCode.LOGIN_LOCKED,
      `登录失败次数过多，请 ${LOGIN_LOCK_WINDOW_MINUTES} 分钟后再试`,
    );
  }

  const valid = await verifyPassword(user.password_hash, input.password);
  if (!valid) {
    recordAttempt(false);
    throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '邮箱或密码错误');
  }

  recordAttempt(true);

  // 创建会话
  const sessionId = uuidv4();
  const jwtToken = signToken({ userId: user.id, sessionId, email: user.email });
  const tokenHash = sha256(jwtToken);
  const durationDays = input.remember ? 30 : 1;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, device_name, ip_address, remember, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    user.id,
    tokenHash,
    input.deviceName ?? null,
    ipAddress ?? null,
    input.remember ? 1 : 0,
    expiresAt,
  );

  const { password_hash, verify_token, ...safeUser } = user;

  logger.info({ userId: user.id, email: user.email }, '用户登录成功');

  return { token: jwtToken, user: safeUser };
}

/**
 * 退出登录（撤销 Token）
 */
export function logout(tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

/**
 * 验证邮箱
 */
export function verifyEmail(token: string): void {
  const user = db.prepare(
    `SELECT id FROM users WHERE verify_token = ? AND verify_expires > datetime('now')`
  ).get(token) as { id: string } | undefined;

  if (!user) {
    throw new AppError(ErrorCode.AUTH_VERIFY_TOKEN_INVALID, '验证链接无效或已过期');
  }

  db.prepare(`
    UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(user.id);

  logger.info({ userId: user.id }, '用户邮箱验证成功');
}

/**
 * 请求密码重置
 */
export async function forgotPassword(email: string): Promise<void> {
  const user = db.prepare('SELECT id, username FROM users WHERE email = ?').get(email) as
    | { id: string; username: string }
    | undefined;

  // 即使邮箱不存在也不报错（防止枚举）
  if (!user) return;

  const resetToken = uuidv4();
  const tokenHash = sha256(resetToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();  // 1小时

  db.prepare(`
    INSERT INTO password_resets (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), user.id, tokenHash, expiresAt);

  await sendPasswordResetEmail(email, user.username, resetToken);
}

/**
 * 重置密码
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = sha256(token);
  const reset = db.prepare(`
    SELECT id, user_id FROM password_resets
    WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')
  `).get(tokenHash) as { id: string; user_id: string } | undefined;

  if (!reset) {
    throw new AppError(ErrorCode.AUTH_RESET_TOKEN_INVALID, '重置链接无效或已过期');
  }

  const newHash = await hashPassword(newPassword);

  // 在事务中更新密码并标记 Token 已使用
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
    `).run(newHash, reset.user_id);

    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

    // 撤销该用户所有会话（强制重新登录）
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id);
  });

  tx();

  logger.info({ userId: reset.user_id }, '用户密码重置成功');
}
