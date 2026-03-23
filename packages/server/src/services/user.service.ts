import db from '../database/connection.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import type { UserRecord } from './auth.service.js';
import type { UpdateProfileInput, ChangePasswordInput } from '../validators/user.schema.js';

/**
 * 根据 ID 获取用户信息（不含敏感字段）
 */
export function getUserById(userId: string): Omit<UserRecord, 'password_hash' | 'verify_token'> {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRecord | undefined;

  if (!user) {
    throw new AppError(404, 404, '用户不存在');
  }

  const { password_hash, verify_token, ...safeUser } = user;
  return safeUser;
}

/**
 * 更新用户资料
 */
export function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Omit<UserRecord, 'password_hash' | 'verify_token'> {
  // 如果更新用户名，检查是否已被占用
  if (input.username) {
    const existing = db.prepare(
      'SELECT id FROM users WHERE username = ? AND id != ?'
    ).get(input.username, userId);

    if (existing) {
      throw new AppError(409, 409, '该用户名已被占用');
    }
  }

  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const values: unknown[] = [];

  if (input.username !== undefined) {
    sets.push('username = ?');
    values.push(input.username);
  }

  if (input.avatarUrl !== undefined) {
    sets.push('avatar_url = ?');
    values.push(input.avatarUrl);
  }

  values.push(userId);

  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  logger.info({ userId }, '用户资料已更新');

  return getUserById(userId);
}

/**
 * 修改密码
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
    | { password_hash: string }
    | undefined;

  if (!user) {
    throw new AppError(404, 404, '用户不存在');
  }

  const valid = await verifyPassword(user.password_hash, input.currentPassword);
  if (!valid) {
    throw new AppError(400, 400, '当前密码不正确');
  }

  const newHash = await hashPassword(input.newPassword);

  db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
  `).run(newHash, userId);

  logger.info({ userId }, '用户密码已修改');
}

/**
 * 设置 E2EE 加密盐值
 */
export function setEncryptionSalt(userId: string, salt: string): void {
  const user = db.prepare('SELECT encryption_salt FROM users WHERE id = ?').get(userId) as
    | { encryption_salt: string | null }
    | undefined;

  if (!user) {
    throw new AppError(404, 404, '用户不存在');
  }

  if (user.encryption_salt) {
    throw new AppError(400, 400, '加密盐值已设置，不能修改');
  }

  db.prepare(`
    UPDATE users SET encryption_salt = ?, updated_at = datetime('now') WHERE id = ?
  `).run(salt, userId);

  logger.info({ userId }, '用户 E2EE 加密盐值已设置');
}

/**
 * 获取用户的所有活跃会话
 */
export function getUserSessions(userId: string): Array<{
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  remember: number;
  expiresAt: string;
  createdAt: string;
}> {
  const sessions = db.prepare(`
    SELECT id, device_name, ip_address, remember, expires_at, created_at
    FROM sessions
    WHERE user_id = ? AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `).all(userId) as Array<{
    id: string;
    device_name: string | null;
    ip_address: string | null;
    remember: number;
    expires_at: string;
    created_at: string;
  }>;

  return sessions.map(s => ({
    id: s.id,
    deviceName: s.device_name,
    ipAddress: s.ip_address,
    remember: s.remember,
    expiresAt: s.expires_at,
    createdAt: s.created_at,
  }));
}

/**
 * 删除账户（需密码确认）
 */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
    | { password_hash: string }
    | undefined;

  if (!user) {
    throw new AppError(404, 404, '用户不存在');
  }

  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    throw new AppError(400, 400, '密码不正确');
  }

  // 删除所有会话
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  // 删除同步数据
  db.prepare('DELETE FROM sync_entities WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM sync_cursors WHERE user_id = ?').run(userId);
  // 删除用户
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  logger.info({ userId }, '用户账户已删除');
}

/**
 * 撤销指定会话
 */
export function revokeSession(userId: string, sessionId: string): void {
  const result = db.prepare(
    'DELETE FROM sessions WHERE id = ? AND user_id = ?'
  ).run(sessionId, userId);

  if (result.changes === 0) {
    throw new AppError(404, 404, '会话不存在');
  }

  logger.info({ userId, sessionId }, '会话已撤销');
}
