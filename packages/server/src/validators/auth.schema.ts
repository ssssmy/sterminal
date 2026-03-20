import { z } from 'zod';

/**
 * 注册请求 Schema
 */
export const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少 3 个字符')
    .max(32, '用户名最多 32 个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和连字符'),
  email: z.string().email('邮箱格式不正确'),
  password: z
    .string()
    .min(8, '密码至少 8 个字符')
    .max(128, '密码最多 128 个字符'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

/**
 * 登录请求 Schema
 */
export const LoginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '密码不能为空'),
  deviceName: z.string().max(64).optional(),
  remember: z.boolean().optional().default(true),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * 请求密码重置 Schema
 */
export const ForgotPasswordSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

/**
 * 执行密码重置 Schema
 */
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token 不能为空'),
  password: z
    .string()
    .min(8, '密码至少 8 个字符')
    .max(128, '密码最多 128 个字符'),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

/**
 * 邮箱验证 Schema
 */
export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Token 不能为空'),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

/**
 * 刷新 Token Schema
 */
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token 不能为空'),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
