import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import { sha256 } from '../utils/hash.js';
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '../validators/auth.schema.js';

/**
 * 注册
 * POST /api/v1/auth/register
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as RegisterInput;
    const ipAddress = req.ip ?? req.socket.remoteAddress;
    const result = await authService.register(input, ipAddress);

    res.status(201).json({
      code: 0,
      data: result,
      message: '注册成功，请查收验证邮件',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 登录
 * POST /api/v1/auth/login
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as LoginInput;
    const ipAddress = req.ip ?? req.socket.remoteAddress;
    const result = await authService.login(input, ipAddress);

    res.json({
      code: 0,
      data: result,
      message: '登录成功',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 退出登录
 * POST /api/v1/auth/logout
 */
export function logout(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      authService.logout(sha256(token));
    }

    res.json({
      code: 0,
      data: null,
      message: '已退出登录',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 验证邮箱
 * GET /api/v1/auth/verify-email?token=xxx
 */
export function verifyEmail(req: Request, res: Response, next: NextFunction): void {
  try {
    const { token } = req.query as VerifyEmailInput;
    authService.verifyEmail(token);

    res.json({
      code: 0,
      data: null,
      message: '邮箱验证成功',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 请求密码重置
 * POST /api/v1/auth/forgot-password
 */
export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body as ForgotPasswordInput;
    await authService.forgotPassword(email);

    res.json({
      code: 0,
      data: null,
      message: '如果该邮箱已注册，您将收到密码重置邮件',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 重置密码
 * POST /api/v1/auth/reset-password
 */
export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body as ResetPasswordInput;
    await authService.resetPassword(token, password);

    res.json({
      code: 0,
      data: null,
      message: '密码重置成功，请重新登录',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * OAuth 回调处理 - 返回 Token
 * GET /api/v1/auth/github/callback (由 Passport 处理后调用)
 * GET /api/v1/auth/google/callback
 */
export function oauthCallback(req: Request, res: Response): void {
  // passport 将结果挂载到 req.user
  const result = req.user as { token: string } | undefined;

  if (!result?.token) {
    res.redirect(`${process.env.BASE_URL ?? 'http://localhost:5173'}?error=oauth_failed`);
    return;
  }

  // 重定向到客户端深度链接，携带 Token
  res.redirect(`sterminal://oauth?token=${result.token}`);
}
