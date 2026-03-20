import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as fileController from '../controllers/file.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { config } from '../config.js';

/**
 * 配置 multer 存储引擎
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(config.uploadDir));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar_${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,  // 2MB 上限
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 jpg/png/gif/webp 格式'));
    }
  },
});

const router = Router();

// 所有文件路由都需要认证
router.use(authMiddleware);

// 上传头像
router.post('/avatar', upload.single('avatar'), fileController.uploadAvatar);

// 删除头像
router.delete('/avatar', fileController.deleteAvatar);

export default router;
