import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Zod Schema 验证中间件工厂
 * 用于验证请求体、查询参数或路由参数
 *
 * @example
 * router.post('/login', validate(LoginSchema), authController.login)
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // 将解析后的数据写回（经过 coerce/default 处理）
    (req as Record<string, unknown>)[source] = result.data;
    next();
  };
}
