import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { ErrorCode, httpStatusFromCode } from '../utils/error-codes.js';

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}

/**
 * 应用级自定义错误
 *
 * 推荐用法（仅传业务码）：
 *   throw new AppError(ErrorCode.USER_EMAIL_EXISTS, '该邮箱已被注册')
 *
 * 兼容旧签名（HTTP 状态码 + 业务码）：
 *   throw new AppError(409, 40901, '该邮箱已被注册')
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: number;

  constructor(codeOrStatus: number, codeOrMessage: number | string, message?: string) {
    if (typeof codeOrMessage === 'string') {
      // 单参业务码签名：(code, message)
      super(codeOrMessage);
      this.code = codeOrStatus;
      this.statusCode = httpStatusFromCode(codeOrStatus);
    } else {
      // 旧签名：(statusCode, code, message)
      super(message ?? '');
      this.statusCode = codeOrStatus;
      this.code = codeOrMessage;
    }
    this.name = 'AppError';
  }
}

/**
 * 全局错误处理中间件
 * 统一将各类错误转换为 { code, data, message } 格式
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Zod 校验错误
  if (err instanceof ZodError) {
    res.status(400).json({
      code: ErrorCode.VALIDATION_FAILED,
      data: err.flatten(),
      message: '请求参数校验失败',
    } satisfies ApiResponse);
    return;
  }

  // 应用自定义错误
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      data: null,
      message: err.message,
    } satisfies ApiResponse);
    return;
  }

  // multer 文件上传错误
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    const multerErr = err as { code: string; message: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        code: ErrorCode.FILE_TOO_LARGE,
        data: null,
        message: '文件超过大小限制',
      } satisfies ApiResponse);
      return;
    }
  }

  // 文件类型校验错误（fileFilter 抛出的 Error）
  if (err instanceof Error && err.message.includes('只支持')) {
    res.status(415).json({
      code: ErrorCode.FILE_TYPE_INVALID,
      data: null,
      message: err.message,
    } satisfies ApiResponse);
    return;
  }

  // 未知错误
  logger.error({ err, url: req.url, method: req.method }, '未处理的服务器错误');

  res.status(500).json({
    code: ErrorCode.INTERNAL,
    data: null,
    message: '服务器内部错误',
  } satisfies ApiResponse);
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    code: ErrorCode.ROUTE_NOT_FOUND,
    data: null,
    message: `路由不存在: ${req.method} ${req.path}`,
  } satisfies ApiResponse);
}
