// Electron 主进程入口
// 负责创建窗口、注册 IPC handlers、初始化数据库

import { app, BrowserWindow } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase } from './services/db'
import { registerAllHandlers } from './ipc/index'
import { disconnectAllSsh } from './ipc/ssh.handler'
import { killAllPty } from './ipc/pty.handler'

// 是否为开发模式
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

/**
 * 创建主窗口
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    // 自定义标题栏（与 UI 设计保持一致）
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
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
  killAllPty()
  disconnectAllSsh()
  closeDatabase()
})
