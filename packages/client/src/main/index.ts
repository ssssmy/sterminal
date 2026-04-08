// Electron 主进程入口
// 负责创建窗口、注册 IPC handlers、初始化数据库

import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase, dbGet, dbRun } from './services/db'
import { registerAllHandlers } from './ipc/index'
import { disconnectAllSsh } from './ipc/ssh.handler'
import { killAllPty } from './ipc/pty.handler'
import { stopAllRecordings, autoCleanRecordings } from './services/session-recorder'
import { stopAllTunnels } from './ipc/port-forward.handler'
import { closeAllSftpSessions } from './ipc/sftp.handler'
import { stopSync } from './ipc/sync.handler'
import { vaultService } from './services/vault-service'
import { initAutoUpdater, registerUpdateHandlers, scheduleUpdateCheck } from './services/auto-updater'
import { registerCliHandlers } from './services/cli-installer'
import { initTray, setQuitting, getQuitting, updateTrayMenu, destroyTray } from './services/tray-service'
import { IPC_WINDOW } from '../shared/types/ipc-channels'

// 是否为开发模式
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ===== URI Scheme 协议注册（sterminal://） =====
app.setAsDefaultProtocolClient('sterminal')

let mainWindow: BrowserWindow | null = null

// ===== 窗口尺寸/位置持久化 =====

interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

function loadWindowBounds(): WindowBounds {
  try {
    const row = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['window.bounds'])
    if (row) return JSON.parse(row.value)
  } catch { /* ignore */ }
  return { width: 1440, height: 900 }
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const isMaximized = mainWindow.isMaximized()
  // 最大化时用 getNormalBounds 获取还原前的尺寸
  const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
  const data: WindowBounds = { ...bounds, isMaximized }
  try {
    dbRun(
      `INSERT INTO settings (key, value, sync_updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, sync_updated_at = excluded.sync_updated_at`,
      ['window.bounds', JSON.stringify(data)]
    )
  } catch { /* ignore */ }
}

/**
 * 判断是否为集成显卡（保守策略：仅识别 Intel 集成显卡 vendorId 0x8086）
 */
function isIntegratedGpu(vendorId: number): boolean {
  return vendorId === 0x8086
}

/**
 * 创建主窗口
 */
function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const saved = loadWindowBounds()

  // 窗口图标（Windows/Linux 需要显式设置，macOS 由 .icns 处理）
  const windowIcon = !isMac
    ? path.join(__dirname, '../../resources/icon.png')
    : undefined

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    ...(windowIcon ? { icon: windowIcon } : {}),
    minWidth: 1024,
    minHeight: 600,
    show: false, // 等渲染完成再显示，避免白屏闪烁
    // 自定义标题栏（与 UI 设计保持一致）
    titleBarStyle: 'hidden',
    // macOS：交通灯按钮位置
    ...(isMac ? { trafficLightPosition: { x: 16, y: 16 } } : {}),
    // Windows：显示原生窗口控制按钮（最小化/最大化/关闭）
    ...(isWindows ? {
      titleBarOverlay: {
        color: '#1a1b2e',
        symbolColor: '#e2e8f0',
        height: 40,
      },
    } : {}),
    backgroundColor: '#1a1b2e',
    webPreferences: {
      // 预加载脚本，暴露 contextBridge API
      preload: path.join(__dirname, '../preload/index.js'),
      // 安全性设置
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      zoomFactor: 1.0,
    },
  })

  if (saved.isMaximized) {
    mainWindow.maximize()
  }

  // 页面渲染完成后再显示窗口，消除白屏感知
  mainWindow.once('ready-to-show', () => {
    // 确保初始缩放为 1.0，防止旧值导致界面异常
    mainWindow?.webContents.setZoomFactor(1.0)
    mainWindow?.show()

    // 渐进增强：检测 GPU 类型，仅在独立显卡上启用背景模糊
    app.getGPUInfo('basic').then((info: any) => {
      const gpuDevices = info?.gpuDevice || []
      const hasDiscreteGpu = gpuDevices.some((d: any) => d.active && !isIntegratedGpu(d.vendorId))
      mainWindow?.webContents.executeJavaScript(
        `document.documentElement.classList.toggle('gpu-blur-capable', ${hasDiscreteGpu})`
      )
    }).catch(() => {
      // 检测失败时不启用模糊，保守降级
    })
  })

  // 记录窗口尺寸变化（节流，避免 resize 时频繁写库）
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveWindowBounds, 500)
  }
  mainWindow.on('resize', debouncedSave)
  mainWindow.on('move', debouncedSave)
  mainWindow.on('maximize', saveWindowBounds)
  mainWindow.on('unmaximize', saveWindowBounds)

  if (isDev) {
    // 开发模式：加载 Vite dev server
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：加载打包后的 HTML 文件
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // Cmd+Shift+I / Ctrl+Shift+I 打开 DevTools（生产环境也可用）
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'I' && input.shift && (input.meta || input.control)) {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // 关闭窗口时最小化到托盘（非真正退出）
  mainWindow.on('close', (e) => {
    if (!getQuitting()) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ===== 应用生命周期 =====

app.whenReady().then(() => {
  // 1. 初始化本地数据库
  initDatabase()

  // 2. 注册所有 IPC handlers
  registerAllHandlers()

  // 3. 自动更新 + CLI
  initAutoUpdater()
  registerUpdateHandlers()
  registerCliHandlers()
  if (!isDev) scheduleUpdateCheck() // 开发模式不检查更新

  // 启动时自动清理过期录制文件
  autoCleanRecordings()

  // Windows: 监听主题变更，更新标题栏覆盖层颜色
  if (process.platform === 'win32') {
    ipcMain.handle(IPC_WINDOW.SET_TITLE_BAR_OVERLAY, (_event, overlay: { color: string; symbolColor: string }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitleBarOverlay({
          color: overlay.color,
          symbolColor: overlay.symbolColor,
        })
      }
    })
  }

  // 界面缩放
  ipcMain.handle(IPC_WINDOW.SET_ZOOM, (_event, level: number) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setZoomFactor(level)
    }
  })

  // 3. 创建主窗口
  createWindow()

  // 4. 初始化系统托盘
  if (mainWindow) {
    initTray(mainWindow)
  }

  // macOS：点击 Dock 图标时重新创建窗口或显示已有窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// ===== Deep Link 处理（sterminal:// URI Scheme） =====

/**
 * 解析 sterminal:// URL 并转发到渲染进程
 *
 * 支持的 URL 格式：
 *   sterminal://connect?host=<address>&port=<port>&user=<username>
 *   sterminal://connect?id=<hostId>
 *   sterminal://open                         (打开窗口)
 *   sterminal://new-terminal                 (新建本地终端)
 */
function handleDeepLink(url: string): void {
  if (!url.startsWith('sterminal://')) return
  // 显示并聚焦窗口
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
  try {
    const parsed = new URL(url)
    const action = parsed.hostname || parsed.pathname.replace(/^\/+/, '')
    mainWindow?.webContents.send('system:deep-link', {
      action,
      params: Object.fromEntries(parsed.searchParams.entries()),
    })
  } catch {
    // 无效 URL 静默忽略
  }
}

// macOS: 应用已运行时收到 URL
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// Windows/Linux: 单实例锁 + 第二实例传 URL
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows: URL 在 argv 最后一个参数
    const url = argv.find(arg => arg.startsWith('sterminal://'))
    if (url) handleDeepLink(url)
    // 聚焦已有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

// 所有窗口关闭时：有托盘不退出，macOS 不退出
app.on('window-all-closed', () => {
  // 托盘模式下不退出，让用户通过托盘菜单退出
})

// Cmd+Q / Alt+F4 真正退出时标记
app.on('before-quit', () => {
  setQuitting(true)
  destroyTray()
  saveWindowBounds()
  vaultService.lock()
  stopSync()
  stopAllRecordings()
  stopAllTunnels()
  closeAllSftpSessions()
  killAllPty()
  disconnectAllSsh()
  closeDatabase()
})
