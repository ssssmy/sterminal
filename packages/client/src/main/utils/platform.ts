// 平台相关工具函数

import { app } from 'electron'
import * as path from 'path'

/**
 * 校验路径在用户 home 目录下，返回 resolved 路径
 * 防止路径遍历攻击
 */
export function assertUnderHome(rawPath: string): string {
  const resolved = path.resolve(rawPath)
  const home = app.getPath('home')
  if (resolved !== home && !resolved.startsWith(home + path.sep)) {
    throw new Error('Access denied: path outside home directory')
  }
  return resolved
}

/**
 * 获取当前平台默认 shell
 */
export function getDefaultShell(): string {
  return process.platform === 'win32'
    ? 'powershell.exe'
    : process.env.SHELL || '/bin/zsh'
}
