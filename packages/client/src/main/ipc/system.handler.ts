// 系统操作 IPC Handler
// 处理剪贴板、外部链接、Shell 列表等系统级操作

import { ipcMain, shell, clipboard } from 'electron'
import { execSync } from 'child_process'
import * as fs from 'fs'
import { IPC_SYSTEM } from '../../shared/types/ipc-channels'
import { assertUnderHome } from '../utils/platform'

/**
 * 注册系统操作相关的 IPC handlers
 */
export function registerSystemHandlers(): void {
  // 获取系统可用 Shell 列表
  ipcMain.handle(IPC_SYSTEM.GET_SHELL_LIST, () => {
    return getAvailableShells()
  })

  // 打开外部链接或文件
  ipcMain.handle(IPC_SYSTEM.OPEN_EXTERNAL, async (_event, target: string) => {
    await shell.openExternal(target)
  })

  // 用系统文件管理器打开指定路径（跨平台：Finder / Explorer / Files）
  ipcMain.handle(IPC_SYSTEM.OPEN_PATH, async (_event, targetPath: string) => {
    const resolved = assertUnderHome(targetPath)
    await shell.openPath(resolved)
  })

  // 延时清除剪贴板（用于密码自动清除功能）
  ipcMain.handle(IPC_SYSTEM.CLIPBOARD_CLEAR, (_event, delayMs: number) => {
    setTimeout(() => {
      clipboard.writeText('')
    }, delayMs)
  })
}

let cachedShells: string[] | null = null

/**
 * 获取系统可用的 Shell 列表（结果缓存，应用生命周期内不变）
 */
function getAvailableShells(): string[] {
  if (cachedShells) return cachedShells
  const platform = process.platform

  if (platform === 'win32') {
    cachedShells = ['cmd.exe', 'powershell.exe', 'pwsh.exe'].filter(sh => {
      try {
        execSync(`where ${sh}`, { stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    })
    return cachedShells
  }

  // macOS / Linux: 读取 /etc/shells
  try {
    const content = fs.readFileSync('/etc/shells', 'utf-8')
    cachedShells = content
      .split('\n')
      .filter((line: string) => line.startsWith('/'))
      .map((line: string) => line.trim())
  } catch {
    cachedShells = ['/bin/bash', '/bin/zsh', '/bin/sh']
  }
  return cachedShells
}
