import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { AppError } from '../middleware/error-handler.js';
import db from '../database/connection.js';
import { logger } from '../utils/logger.js';

/**
 * 上传头像
 * POST /api/v1/file/avatar
 */
export function uploadAvatar(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.file) {
      throw new AppError(400, 400, '请上传头像文件');
    }

    const userId = req.user!.userId;
    const fileName = req.file.filename;
    const avatarUrl = `${config.baseUrl}/uploads/${fileName}`;

    // 更新用户头像 URL
    db.prepare(
      `UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(avatarUrl, userId);

    logger.info({ userId, fileName }, '头像上传成功');

    res.json({
      code: 0,
      data: { avatarUrl },
      message: '头像上传成功',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 删除当前用户头像
 * DELETE /api/v1/file/avatar
 */
export function deleteAvatar(req: Request, res: Response, next: NextFunction): void {
  try {
    const userId = req.user!.userId;

    const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId) as
      | { avatar_url: string | null }
      | undefined;

    if (user?.avatar_url) {
      // 删除本地文件
      const fileName = path.basename(user.avatar_url);
      const filePath = path.join(path.resolve(config.uploadDir), fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    db.prepare(
      `UPDATE users SET avatar_url = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(userId);

    logger.info({ userId }, '头像已删除');

    res.json({
      code: 0,
      data: null,
      message: '头像已删除',
    });
  } catch (err) {
    next(err);
  }
}
