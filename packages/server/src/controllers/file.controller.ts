import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCode } from '../utils/error-codes.js';
import db from '../database/connection.js';
import { logger } from '../utils/logger.js';

/**
 * 安全删除上传目录下的旧头像文件
 * 路径必须落在 config.uploadDir 之内，避免任意文件删除
 */
function safelyRemoveAvatarFile(avatarUrl: string | null): void {
  if (!avatarUrl) return;

  // 仅处理本服务托管的 URL（/uploads/xxx）
  const uploadsPrefix = `${config.baseUrl}/uploads/`;
  if (!avatarUrl.startsWith(uploadsPrefix)) return;

  const fileName = avatarUrl.slice(uploadsPrefix.length);
  // 去掉查询串/分段，避免路径穿越
  const safeName = path.basename(fileName);
  const uploadRoot = path.resolve(config.uploadDir);
  const filePath = path.join(uploadRoot, safeName);

  // 二次校验解析后的绝对路径仍在上传目录内
  if (!filePath.startsWith(uploadRoot + path.sep) && filePath !== uploadRoot) return;

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug({ filePath }, '旧头像文件已删除');
    }
  } catch (err) {
    // 文件已被外部清理或权限问题：仅记日志，不影响主流程
    logger.warn({ err, filePath }, '删除旧头像失败');
  }
}

/**
 * 上传头像
 * POST /api/v1/file/avatar
 *
 * 表单字段：avatar (multipart/form-data)
 * 限制：≤ 2MB；扩展名 jpg/jpeg/png/gif/webp（由 file.routes.ts 的 multer 配置强制）
 */
export function uploadAvatar(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.file) {
      throw new AppError(ErrorCode.FILE_MISSING, '请上传头像文件');
    }

    const userId = req.user!.userId;

    // 读取旧头像 URL，准备替换后清理
    const old = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId) as
      | { avatar_url: string | null }
      | undefined;

    if (!old) {
      // 用户在上传后被删除：清理本次上传的文件再报错
      safelyRemoveAvatarFile(`${config.baseUrl}/uploads/${req.file.filename}`);
      throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在');
    }

    const newUrl = `${config.baseUrl}/uploads/${req.file.filename}`;

    // 更新数据库
    db.prepare(
      `UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(newUrl, userId);

    // 清理旧头像文件（数据库更新成功后再清理，避免异常导致文件丢失）
    safelyRemoveAvatarFile(old.avatar_url);

    logger.info(
      { userId, fileName: req.file.filename, size: req.file.size },
      '头像上传成功',
    );

    res.json({
      code: 0,
      data: { avatarUrl: newUrl },
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

    if (!user) {
      throw new AppError(ErrorCode.USER_NOT_FOUND, '用户不存在');
    }

    safelyRemoveAvatarFile(user.avatar_url);

    db.prepare(
      `UPDATE users SET avatar_url = NULL, updated_at = datetime('now') WHERE id = ?`,
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
