import type { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service.js';
import { signToken } from '../utils/jwt.js';
import type { UpdateProfileInput, ChangePasswordInput, SetEncryptionSaltInput } from '../validators/user.schema.js';

/**
 * 获取当前用户信息
 * GET /api/v1/user/me
 */
export function getMe(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId, sessionId, email } = req.user!;
    const user = userService.getUserById(userId);

    // 续签 token：每次访问重置 7 天有效期
    const newToken = signToken({ userId, sessionId, email });

    res.json({
      code: 0,
      data: { ...user, token: newToken },
      message: 'ok',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 更新用户资料
 * PATCH /api/v1/user/me
 */
export function updateProfile(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const input = req.body as UpdateProfileInput;
    const user = userService.updateProfile(userId, input);

    res.json({
      code: 0,
      data: user,
      message: '资料已更新',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 修改密码
 * PUT /api/v1/user/me/password
 */
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const input = req.body as ChangePasswordInput;
    await userService.changePassword(userId, input);

    res.json({
      code: 0,
      data: null,
      message: '密码已修改',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 设置 E2EE 加密盐值
 * POST /api/v1/user/me/encryption-salt
 */
export function setEncryptionSalt(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const { encryptionSalt } = req.body as SetEncryptionSaltInput;
    userService.setEncryptionSalt(userId, encryptionSalt);

    res.json({
      code: 0,
      data: null,
      message: '加密盐值已设置',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 获取用户会话列表
 * GET /api/v1/user/me/sessions
 */
export function getSessions(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const sessions = userService.getUserSessions(userId);

    res.json({
      code: 0,
      data: sessions,
      message: 'ok',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 撤销指定会话
 * DELETE /api/v1/user/me/sessions/:sessionId
 */
export function revokeSession(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const { sessionId } = req.params;
    userService.revokeSession(userId, sessionId);

    res.json({
      code: 0,
      data: null,
      message: '会话已撤销',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 删除账户
 * DELETE /api/v1/user/me
 */
export async function deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ code: 400, data: null, message: '请提供密码以确认删除' });
      return;
    }

    await userService.deleteAccount(userId, password);

    res.json({
      code: 0,
      data: null,
      message: '账户已删除',
    });
  } catch (err) {
    next(err);
  }
}
