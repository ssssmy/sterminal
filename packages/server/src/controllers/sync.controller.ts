import type { Request, Response, NextFunction } from 'express';
import * as syncService from '../services/sync.service.js';
import type { PushSyncInput, PullSyncQuery } from '../validators/sync.schema.js';

/**
 * 推送同步数据（客户端 → 服务端）
 * POST /api/v1/sync/push
 */
export function pushSync(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;
    const input = req.body as PushSyncInput;
    const result = syncService.pushSync(userId, input);

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
