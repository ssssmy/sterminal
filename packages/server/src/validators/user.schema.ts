import { z } from 'zod';

/**
 * 更新用户资料 Schema
 */
export const UpdateProfileSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少 3 个字符')
    .max(32, '用户名最多 32 个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和连字符')
    .optional(),
  avatarUrl: z.string().url('头像 URL 格式不正确').optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/**
 * 修改密码 Schema
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码不能为空'),
  newPassword: z
    .string()
    .min(8, '新密码至少 8 个字符')
    .max(128, '新密码最多 128 个字符'),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

/**
 * 设置 E2EE 加密盐值 Schema
 */
export const SetEncryptionSaltSchema = z.object({
  encryptionSalt: z.string().min(1, '加密盐值不能为空'),
});

export type SetEncryptionSaltInput = z.infer<typeof SetEncryptionSaltSchema>;
