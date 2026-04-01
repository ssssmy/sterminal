// Electron 主进程入口
// 负责创建窗口、注册 IPC handlers、初始化数据库

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
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
import { IPC_WINDOW } from '../shared/types/ipc-channels'

// 是否为开发模式
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

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

function isMinimizeToTray(): boolean {
  try {
    const row = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['system.minimizeToTray'])
    if (row) return row.value === 'true' || row.value === '1'
  } catch { /* ignore */ }
  // default is true (from DEFAULT_SETTINGS)
  return true
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')

  let icon = nativeImage.createFromPath(iconPath)

  if (process.platform === 'darwin') {
    // macOS: resize to 16x16 template image for menu bar
    icon = icon.resize({ width: 16, height: 16 })
    icon.setTemplateImage(true)
  } else {
    icon = icon.resize({ width: 16, height: 16 })
  }

  tray = new Tray(icon)
  tray.setToolTip('STerminal')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('system:tray-action', 'open-settings')
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // Single-click toggles window visibility
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

/**
 * 创建主窗口
 */
function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const saved = loadWindowBounds()

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
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

  mainWindow.on('close', (event) => {
    if (isMinimizeToTray() && tray) {
      event.preventDefault()
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

  // 3. 自动更新
  initAutoUpdater()
  registerUpdateHandlers()
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

  // 4. 创建系统托盘
  createTray()

  // macOS：点击 Dock 图标时显示窗口
  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出（Windows / Linux）
// 如果启用了 minimizeToTray，close 事件会被阻止，此处不会触发
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isMinimizeToTray()) {
    app.quit()
  }
})

// 应用退出前清理资源
app.on('before-quit', () => {
  saveWindowBounds()
  if (tray) {
    tray.destroy()
    tray = null
  }
  vaultService.lock()
  stopSync()
  stopAllRecordings()
  stopAllTunnels()
  closeAllSftpSessions()
  killAllPty()
  disconnectAllSsh()
  closeDatabase()
})
