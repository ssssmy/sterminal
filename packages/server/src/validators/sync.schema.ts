import { z } from 'zod';

/**
 * 同步实体类型枚举
 */
export const EntityTypeEnum = z.enum([
  'host',
  'host_group',
  'local_terminal',
  'local_terminal_group',
  'snippet',
  'snippet_group',
  'port_forward',
  'tag',
  'settings',
  'custom_theme',
  'sftp_bookmark',
  'keybinding',
  'key',
  'vault_entry',
]);

export type EntityType = z.infer<typeof EntityTypeEnum>;

/**
 * CRDT 字段时钟
 */
export const TickSchema = z.object({
  ts: z.string().min(1),
  did: z.string().min(1),
});

export type Tick = z.infer<typeof TickSchema>;

/**
 * 单个同步实体 Schema（CRDT 协议）
 *
 *   - fields:     字段名 -> 值（任意 JSON）
 *   - fieldMeta:  字段名 -> {ts, did} 字段级 LWW 时钟
 *   - tombstone:  实体删除事件的时钟（可空）
 *   - updatedAt:  max(fieldMeta[*].ts, tombstone.ts)，用作服务端游标
 */
export const SyncEntitySchema = z.object({
  id: z.string().min(1, '实体 ID 不能为空'),
  entityType: EntityTypeEnum,
  fields: z.record(z.unknown()),
  fieldMeta: z.record(TickSchema),
  tombstone: TickSchema.nullable().optional(),
  updatedAt: z.string().min(1, '更新时间不能为空'),
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
  since: z.string().optional(),
  entityType: EntityTypeEnum.optional(),
  limit: z.coerce.number().int().positive().max(1000).default(200),
});

export type PullSyncQuery = z.infer<typeof PullSyncQuerySchema>;

/**
 * 全量拉取 Schema
 */
export const PullFullQuerySchema = z.object({
  deviceId: z.string().min(1, '设备 ID 不能为空'),
  limit: z.coerce.number().int().positive().max(2000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PullFullQuery = z.infer<typeof PullFullQuerySchema>;

/**
 * 重置同步数据 Schema（破坏性操作，需密码确认）
 */
export const ResetSyncSchema = z.object({
  password: z.string().min(1, '密码不能为空'),
  confirm: z.literal('CONFIRM RESET', {
    errorMap: () => ({ message: '请输入 CONFIRM RESET 以确认' }),
  }),
});

export type ResetSyncInput = z.infer<typeof ResetSyncSchema>;

/**
 * 设置加密 salt Schema
 */
export const SetEncryptionSchema = z.object({
  salt: z.string().min(16, 'salt 至少 16 字节').max(256),
});

export type SetEncryptionInput = z.infer<typeof SetEncryptionSchema>;
