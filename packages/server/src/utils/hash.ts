import argon2 from 'argon2';

/**
 * Argon2id 密码哈希配置
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * 对密码进行 Argon2id 哈希
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * 验证密码是否匹配哈希值
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * 对字符串进行简单 SHA256 哈希（用于 Token 存储）
 * 使用 Node.js 内置 crypto
 */
export function sha256(input: string): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(input).digest('hex');
}
