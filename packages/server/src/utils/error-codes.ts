/**
 * 业务错误码体系（5 位）
 *
 * 编码规则：HTTP 状态码 (3 位) + 业务子码 (2 位)
 *   - 40000 → 通用 400 校验错误
 *   - 40101 → 401 认证：凭据错误
 *   - 40901 → 409 冲突：邮箱已注册
 *   - 42901 → 429 限流：登录锁定
 *
 * 客户端可用 `Math.floor(code / 100)` 取 HTTP 类别（4xx/5xx），
 * 用 `code % 100` 取细分子码以做精准提示。
 */
export const ErrorCode = {
  // ===== 通用 =====
  /** 未知错误 */
  UNKNOWN: 10000,
  /** 内部错误 */
  INTERNAL: 50000,
  /** 参数校验失败 */
  VALIDATION_FAILED: 40000,
  /** 资源不存在 */
  NOT_FOUND: 40400,
  /** 路由不存在 */
  ROUTE_NOT_FOUND: 40499,

  // ===== 认证 (401 / 4xx) =====
  /** 邮箱或密码错误 */
  AUTH_INVALID_CREDENTIALS: 40101,
  /** Token 缺失或格式错误 */
  AUTH_TOKEN_MISSING: 40102,
  /** Token 无效 */
  AUTH_TOKEN_INVALID: 40103,
  /** Token 已过期 */
  AUTH_TOKEN_EXPIRED: 40104,
  /** 会话已撤销 */
  AUTH_SESSION_REVOKED: 40105,

  /** 密码重置链接无效或过期 */
  AUTH_RESET_TOKEN_INVALID: 40001,
  /** 邮箱验证链接无效或过期 */
  AUTH_VERIFY_TOKEN_INVALID: 40002,
  /** 当前密码不正确 */
  AUTH_CURRENT_PASSWORD_WRONG: 40003,

  // ===== 用户 / 冲突 (404 / 409) =====
  USER_NOT_FOUND: 40401,
  USER_EMAIL_EXISTS: 40901,
  USER_USERNAME_EXISTS: 40902,

  // ===== 同步 =====
  SYNC_VERSION_CONFLICT: 40903,
  SYNC_ENTITY_NOT_FOUND: 40402,
  /** 加密盐值已设置（需要 reset 后才能改） */
  SYNC_SALT_ALREADY_SET: 40004,

  // ===== 文件上传 =====
  /** 未上传文件 */
  FILE_MISSING: 40005,
  /** 文件过大 */
  FILE_TOO_LARGE: 41301,
  /** 文件类型不支持 */
  FILE_TYPE_INVALID: 41501,

  // ===== 限流 =====
  RATE_LIMITED: 42900,
  /** 登录失败次数过多 */
  LOGIN_LOCKED: 42901,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * 从业务码提取 HTTP 状态码
 * @example httpStatusFromCode(40901) === 409
 */
export function httpStatusFromCode(code: number): number {
  if (code === ErrorCode.UNKNOWN) return 500;
  if (code === ErrorCode.INTERNAL) return 500;
  return Math.floor(code / 100);
}
