// CLI 安装服务 — 将 sterminal 命令安装到系统 PATH
// 类似 VS Code 的 "Install 'code' command in PATH"

import { app, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { IPC_SYSTEM } from '../../shared/types/ipc-channels'

// CLI 脚本在打包后的位置
function getCliSourcePath(): string {
  if (app.isPackaged) {
    // 生产：asar 内的 bin/sterminal.js
    return path.join(app.getAppPath(), 'bin', 'sterminal.js')
  }
  // 开发：项目目录
  return path.join(__dirname, '../../bin/sterminal.js')
}

// 各平台的安装目标路径
function getCliTargetPath(): string {
  if (process.platform === 'win32') {
    // Windows: 放到 AppData/Local 下，NSIS 安装时可能已在 PATH
    return path.join(app.getPath('home'), 'AppData', 'Local', 'STerminal', 'sterminal.cmd')
  }
  // macOS / Linux: /usr/local/bin/sterminal
  return '/usr/local/bin/sterminal'
}

/**
 * 检查 CLI 是否已安装
 */
function checkCliInstalled(): { installed: boolean; path: string } {
  const target = getCliTargetPath()
  return { installed: fs.existsSync(target), path: target }
}

/**
 * 安装 CLI 到系统 PATH
 */
function installCli(): { success: boolean; path: string; error?: string } {
  const target = getCliTargetPath()
  const source = getCliSourcePath()

  try {
    if (process.platform === 'win32') {
      // Windows: 创建 .cmd 包装文件 + 添加到 PATH
      const dir = path.dirname(target)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      // 生成 .cmd 包装脚本
      const cmdContent = `@echo off\r\nnode "${source}" %*\r\n`
      fs.writeFileSync(target, cmdContent, 'utf-8')

      // 尝试将目录添加到用户 PATH（需要 setx）
      try {
        const currentPath = execSync('echo %PATH%', { shell: 'cmd.exe' as string }).toString().trim()
        if (!currentPath.includes(dir)) {
          execSync(`setx PATH "%PATH%;${dir}"`, { shell: 'cmd.exe' as string })
        }
      } catch {
        // setx 可能失败，用户需要手动添加 PATH
      }
    } else {
      // macOS / Linux: 创建符号链接到 /usr/local/bin
      // 需要 sudo 权限，用 osascript (macOS) 或直接尝试
      const linkDir = path.dirname(target)
      if (!fs.existsSync(linkDir)) {
        fs.mkdirSync(linkDir, { recursive: true })
      }

      // 先删除已有的（可能是旧版本）
      if (fs.existsSync(target)) {
        fs.unlinkSync(target)
      }

      // 创建 shell 包装脚本（不用符号链接，避免 asar 路径问题）
      const shellContent = `#!/bin/sh\nexec node "${source}" "$@"\n`
      fs.writeFileSync(target, shellContent, { mode: 0o755 })
    }

    return { success: true, path: target }
  } catch (err: any) {
    // 权限不足时，macOS 用 osascript 提权
    if (process.platform === 'darwin' && err.code === 'EACCES') {
      try {
        // 先写到临时文件，再用 osascript 提权 move 过去
        const tmpFile = path.join(app.getPath('temp'), 'sterminal-cli-tmp')
        const shellContent = `#!/bin/sh\nexec node "${source}" "$@"\n`
        fs.writeFileSync(tmpFile, shellContent, { mode: 0o755 })
        execSync(
          `osascript -e 'do shell script "mv ${tmpFile} ${target} && chmod 755 ${target}" with administrator privileges'`
        )
        return { success: true, path: target }
      } catch (sudoErr: any) {
        return { success: false, path: target, error: sudoErr.message }
      }
    }
    return { success: false, path: target, error: err.message }
  }
}

/**
 * 卸载 CLI
 */
function uninstallCli(): { success: boolean; error?: string } {
  const target = getCliTargetPath()
  try {
    if (fs.existsSync(target)) {
      if (process.platform === 'darwin') {
        try {
          fs.unlinkSync(target)
        } catch {
          execSync(
            `osascript -e 'do shell script "rm -f ${target}" with administrator privileges'`
          )
        }
      } else {
        fs.unlinkSync(target)
      }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * 注册 CLI 安装相关 IPC handlers
 */
export function registerCliHandlers(): void {
  ipcMain.handle(IPC_SYSTEM.CHECK_CLI, () => {
    return checkCliInstalled()
  })

  ipcMain.handle(IPC_SYSTEM.INSTALL_CLI, () => {
    return installCli()
  })

  ipcMain.handle(IPC_SYSTEM.UNINSTALL_CLI, () => {
    return uninstallCli()
  })
}
