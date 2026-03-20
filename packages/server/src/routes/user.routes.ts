import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { UpdateProfileSchema, ChangePasswordSchema, SetEncryptionSaltSchema } from '../validators/user.schema.js';

const router = Router();

// 所有用户路由都需要认证
router.use(authMiddleware);

// 获取当前用户信息
router.get('/me', userController.getMe);

// 更新用户资料
router.patch('/me', validate(UpdateProfileSchema), userController.updateProfile);

// 修改密码
router.put('/me/password', validate(ChangePasswordSchema), userController.changePassword);

// 设置 E2EE 加密盐值
router.post('/me/encryption-salt', validate(SetEncryptionSaltSchema), userController.setEncryptionSalt);

// 获取用户会话列表
router.get('/me/sessions', userController.getSessions);

// 撤销指定会话
router.delete('/me/sessions/:sessionId', userController.revokeSession);

export default router;
