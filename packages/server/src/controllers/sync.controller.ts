import type { Request, Response, NextFunction } from 'express';
import * as syncService from '../services/sync.service.js';
import { verifyPassword } from '../utils/hash.js';
import db from '../database/connection.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCode } from '../utils/error-codes.js';
import type {
  PushSyncInput,
  PullSyncQuery,
  PullFullQuery,
  ResetSyncInput,
  SetEncryptionInput,
} from '../validators/sync.schema.js';
import { notifyUserDevices } from '../websocket/sync-handler.js';
import { getClients } from '../websocket/ws-server.js';

/**
 * 推送同步数据（客户端 → 服务端）
 * POST /api/v1/sync/push
 */
export function pushSync(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const input = req.body as PushSyncInput;
    const result = syncService.pushSync(userId, input);

    // 通知同一用户的其他设备有新数据
    if (result.accepted > 0) {
      notifyUserDevices(userId, input.deviceId, getClients());
    }

    res.json({
      code: 0,
      data: result,
      message: `已接受 ${result.accepted} 条数据`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 拉取同步数据（服务端 → 客户端）
 * GET /api/v1/sync/pull
 */
export function pullSync(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const query = req.query as unknown as PullSyncQuery;
    const result = syncService.pullSync(userId, query);

    res.json({
      code: 0,
      data: result,
      message: 'ok',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 获取同步游标列表
 * GET /api/v1/sync/cursors
 */
export function getCursors(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const cursors = syncService.getSyncCursors(userId);

    res.json({
      code: 0,
      data: cursors,
      message: 'ok',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 删除同步实体（软删除）
 * DELETE /api/v1/sync/entities/:entityType/:entityId
 */
export function deleteEntity(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const { entityType, entityId } = req.params;
    syncService.deleteEntity(userId, entityType, entityId);

    res.json({
      code: 0,
      data: null,
      message: '实体已删除',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 全量拉取（新设备首次同步）
 * GET /api/v1/sync/full?deviceId=xxx&limit=1000&offset=0
 */
export function pullFull(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const query = req.query as unknown as PullFullQuery;
    const result = syncService.pullFullSync(userId, query.limit, query.offset);

    res.json({
      code: 0,
      data: result,
      message: 'ok',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 重置同步数据（清空服务端 sync_entities + sync_cursors + encryption_salt）
 * POST /api/v1/sync/reset
 *
 * 需密码二次确认 + 输入 confirm: 'CONFIRM RESET' 字面量
 */
export async function resetSync(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const input = req.body as ResetSyncInput;

    // 校验密码
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
      | { password_hash: string }
      | undefined;

    if (!user) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在');
    }

    const valid = await verifyPassword(user.password_hash, input.password);
    if (!valid) {
      throw new AppError(ErrorCode.AUTH_CURRENT_PASSWORD_WRONG, '密码不正确');
    }

    const result = syncService.resetSync(userId);

    res.json({
      code: 0,
      data: result,
      message: '同步数据已重置',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 获取 E2EE 加密状态
 * GET /api/v1/sync/encryption
 */
export function getEncryption(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const result = syncService.getEncryptionStatus(userId);

    res.json({
      code: 0,
      data: result,
      message: 'ok',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 设置 E2EE 加密 salt
 * PUT /api/v1/sync/encryption
 */
export function setEncryption(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const input = req.body as SetEncryptionInput;
    syncService.setEncryptionSalt(userId, input.salt);

    res.json({
      code: 0,
      data: null,
      message: '加密已启用',
    });
  } catch (err) {
    next(err);
  }
}
