import { Router } from 'express';
import * as syncController from '../controllers/sync.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import {
  PushSyncSchema,
  PullSyncQuerySchema,
  PullFullQuerySchema,
  ResetSyncSchema,
  SetEncryptionSchema,
} from '../validators/sync.schema.js';

const router = Router();

// 所有同步路由都需要认证 + 同步专用限流
router.use(authMiddleware);
router.use(syncLimiter);

// 推送同步数据
router.post('/push', validate(PushSyncSchema), syncController.pushSync);

// 拉取同步数据（增量）
router.get('/pull', validate(PullSyncQuerySchema, 'query'), syncController.pullSync);

// 全量拉取（新设备首次同步或重建本地）
router.get('/full', validate(PullFullQuerySchema, 'query'), syncController.pullFull);

// 重置同步数据（破坏性，需密码确认）
router.post('/reset', validate(ResetSyncSchema), syncController.resetSync);

// E2EE 加密状态查询 / 启用
router.get('/encryption', syncController.getEncryption);
router.put('/encryption', validate(SetEncryptionSchema), syncController.setEncryption);

// 获取同步游标
router.get('/cursors', syncController.getCursors);

// 软删除实体
router.delete('/entities/:entityType/:entityId', syncController.deleteEntity);

export default router;
