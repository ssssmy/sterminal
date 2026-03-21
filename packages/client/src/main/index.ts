// Electron 主进程入口
// 负责创建窗口、注册 IPC handlers、初始化数据库

import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase, dbGet, dbRun } from './services/db'
import { registerAllHandlers } from './ipc/index'
import { disconnectAllSsh } from './ipc/ssh.handler'
import { killAllPty } from './ipc/pty.handler'
import { stopAllRecordings } from './services/session-recorder'
import { stopAllTunnels } from './ipc/port-forward.handler'
import { IPC_WINDOW } from '../shared/types/ipc-channels'

// 是否为开发模式
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

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
    },
  })

  if (saved.isMaximized) {
    mainWindow.maximize()
  }

  // 页面渲染完成后再显示窗口，消除白屏感知
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
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

  // 3. 创建主窗口
  createWindow()

  // macOS：点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出（Windows / Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理资源
app.on('before-quit', () => {
  saveWindowBounds()
  stopAllRecordings()
  stopAllTunnels()
  killAllPty()
  disconnectAllSsh()
  closeDatabase()
})
