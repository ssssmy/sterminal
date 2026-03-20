import { Router } from 'express';
import * as syncController from '../controllers/sync.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { PushSyncSchema, PullSyncQuerySchema } from '../validators/sync.schema.js';

const router = Router();

// 所有同步路由都需要认证 + 同步专用限流
router.use(authMiddleware);
router.use(syncLimiter);

// 推送同步数据
router.post('/push', validate(PushSyncSchema), syncController.pushSync);

// 拉取同步数据
router.get('/pull', validate(PullSyncQuerySchema, 'query'), syncController.pullSync);

// 获取同步游标
router.get('/cursors', syncController.getCursors);

// 软删除实体
router.delete('/entities/:entityType/:entityId', syncController.deleteEntity);

export default router;
