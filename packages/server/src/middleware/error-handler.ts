import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

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
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: number,
    message: string,
  ) {
    super(message);
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
      code: 400,
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

  // 未知错误
  logger.error({ err, url: req.url, method: req.method }, '未处理的服务器错误');

  res.status(500).json({
    code: 500,
    data: null,
    message: '服务器内部错误',
  } satisfies ApiResponse);
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    code: 404,
    data: null,
    message: `路由不存在: ${req.method} ${req.path}`,
  } satisfies ApiResponse);
}
