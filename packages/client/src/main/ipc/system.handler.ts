// 系统操作 IPC Handler
// 处理剪贴板、外部链接、Shell 列表等系统级操作

import { ipcMain, shell, clipboard } from 'electron'
import { execSync } from 'child_process'
import { IPC_SYSTEM } from '../../shared/types/ipc-channels'

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

  // 延时清除剪贴板（用于密码自动清除功能）
  ipcMain.handle(IPC_SYSTEM.CLIPBOARD_CLEAR, (_event, delayMs: number) => {
    setTimeout(() => {
      clipboard.writeText('')
    }, delayMs)
  })
}

/**
 * 获取系统可用的 Shell 列表
 */
function getAvailableShells(): string[] {
  const platform = process.platform

  if (platform === 'win32') {
    return ['cmd.exe', 'powershell.exe', 'pwsh.exe'].filter(sh => {
      try {
        execSync(`where ${sh}`, { stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    })
  }

  // macOS / Linux: 读取 /etc/shells
  try {
    const content = require('fs').readFileSync('/etc/shells', 'utf-8') as string
    return content
      .split('\n')
      .filter((line: string) => line.startsWith('/'))
      .map((line: string) => line.trim())
  } catch {
    return ['/bin/bash', '/bin/zsh', '/bin/sh']
  }
}
