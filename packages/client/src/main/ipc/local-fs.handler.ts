// 本地文件系统 IPC Handler
// 提供本地文件系统浏览能力（SFTP 面板左侧本地目录树）

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_LOCAL_FS } from '../../shared/types/ipc-channels'
import type { SftpFileInfo } from '../../shared/types/sftp'

/**
 * 将 fs.Stats 转换为 SftpFileInfo
 */
function statsToFileInfo(name: string, filePath: string, stats: fs.Stats): SftpFileInfo {
  const mode = stats.mode & 0o777
  const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  const permissions = perms[(mode >> 6) & 7] + perms[(mode >> 3) & 7] + perms[mode & 7]

  return {
    name,
    path: filePath,
    size: stats.size,
    modifiedTime: stats.mtime.toISOString(),
    permissions,
    mode,
    isDirectory: stats.isDirectory(),
    isSymlink: stats.isSymbolicLink(),
    owner: stats.uid,
    group: stats.gid,
  }
}

/**
 * 注册本地文件系统 IPC handlers
 */
export function registerLocalFsHandlers(): void {
  // 列出本地目录内容
  ipcMain.handle(IPC_LOCAL_FS.LIST, async (_event, dirPath: string) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const files: SftpFileInfo[] = []

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        const stats = await fs.promises.stat(fullPath)
        files.push(statsToFileInfo(entry.name, fullPath, stats))
      } catch {
        // 无法 stat 的文件（权限不足等）跳过
      }
    }

    return files
  })

  // 返回用户主目录
  ipcMain.handle(IPC_LOCAL_FS.HOME, async () => {
    return os.homedir()
  })
}
