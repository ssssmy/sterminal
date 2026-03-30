// 自动更新服务 — 封装 electron-updater
// 检查更新、下载、安装，通过 IPC 向渲染进程推送状态

import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC_SYSTEM } from '../../shared/types/ipc-channels'

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'
  version?: string
  releaseNotes?: string
  progress?: number       // 0-100
  bytesPerSecond?: number
  error?: string
}

// 当前更新状态
let currentStatus: UpdateStatus = { status: 'idle' }

function broadcastStatus(status: UpdateStatus): void {
  currentStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_SYSTEM.UPDATE_STATUS, status)
    }
  }
}

/**
 * 初始化自动更新（在 app.whenReady 后调用）
 */
export function initAutoUpdater(): void {
  // 不自动下载，让用户确认
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // 禁用开发模式下的更新检查（dev 模式没有打包，updater 会报错）
  // electron-updater 会自动检测 app.isPackaged

  autoUpdater.on('checking-for-update', () => {
    broadcastStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    broadcastStatus({
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map(n => n.note).join('\n')
          : undefined,
    })
  })

  autoUpdater.on('update-not-available', () => {
    broadcastStatus({ status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    broadcastStatus({
      status: 'downloading',
      progress: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    broadcastStatus({
      status: 'ready',
      version: info.version,
    })
  })

  autoUpdater.on('error', (err: Error) => {
    broadcastStatus({
      status: 'error',
      error: err.message,
    })
  })
}

/**
 * 注册更新相关的 IPC handlers
 */
export function registerUpdateHandlers(): void {
  // 检查更新
  ipcMain.handle(IPC_SYSTEM.CHECK_UPDATE, async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.updateInfo
        ? { hasUpdate: true, version: result.updateInfo.version }
        : { hasUpdate: false }
    } catch (err: any) {
      return { hasUpdate: false, error: err.message }
    }
  })

  // 下载更新
  ipcMain.handle(IPC_SYSTEM.DOWNLOAD_UPDATE, async () => {
    try {
      await autoUpdater.downloadUpdate()
      return true
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // 安装更新（退出并安装）
  ipcMain.handle(IPC_SYSTEM.INSTALL_UPDATE, () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // 获取当前更新状态
  ipcMain.handle(IPC_SYSTEM.UPDATE_STATUS, () => {
    return currentStatus
  })
}

/**
 * 启动时自动检查更新（延迟 10 秒，避免影响启动性能）
 */
export function scheduleUpdateCheck(): void {
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // 静默忽略自动检查错误（网络问题等）
    })
  }, 10_000)
}
