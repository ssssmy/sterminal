import { z } from 'zod';

/**
 * 同步实体类型枚举
 */
export const EntityTypeEnum = z.enum([
  'host',
  'host_group',
  'local_terminal',
  'snippet',
  'snippet_group',
  'port_forward',
  'key',
  'known_host',
  'vault_entry',
  'tag',
  'settings',
  'terminal_theme',
]);

export type EntityType = z.infer<typeof EntityTypeEnum>;

/**
 * 单个同步实体 Schema
 */
export const SyncEntitySchema = z.object({
  id: z.string().uuid('实体 ID 必须是 UUID'),
  entityType: EntityTypeEnum,
  data: z.string().min(1, '实体数据不能为空'),  // JSON 字符串
  version: z.number().int().positive(),
  deleted: z.boolean().default(false),
  updatedAt: z.string().datetime('时间格式不正确'),
});

export type SyncEntityInput = z.infer<typeof SyncEntitySchema>;

/**
 * 批量推送同步数据 Schema
 */
export const PushSyncSchema = z.object({
  deviceId: z.string().min(1, '设备 ID 不能为空'),
  entities: z.array(SyncEntitySchema).max(500, '单次推送不能超过 500 条'),
});

export type PushSyncInput = z.infer<typeof PushSyncSchema>;

/**
 * 拉取同步数据 Schema（查询参数）
 */
export const PullSyncQuerySchema = z.object({
  deviceId: z.string().min(1, '设备 ID 不能为空'),
  since: z.string().datetime('时间格式不正确').optional(),
  entityType: EntityTypeEnum.optional(),
  limit: z.coerce.number().int().positive().max(1000).default(200),
});

export type PullSyncQuery = z.infer<typeof PullSyncQuerySchema>;
