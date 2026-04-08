// 系统托盘服务 — 跨平台（macOS / Windows / Linux）
// 最小化到托盘、快速连接菜单、显示/退出

import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import path from 'path'
import { dbAll } from './db'

let tray: Tray | null = null
let isQuitting = false

/** 标记为真正退出（托盘右键退出 or Cmd+Q） */
export function setQuitting(val: boolean): void {
  isQuitting = val
}

export function getQuitting(): boolean {
  return isQuitting
}

/**
 * 初始化系统托盘
 */
export function initTray(mainWindow: BrowserWindow): void {
  if (tray) return

  // 托盘图标：macOS 用 16x16 Template 图片（自动适配深浅色菜单栏），其他平台用 32x32
  const isMac = process.platform === 'darwin'
  const iconName = isMac ? 'tray-16x16.png' : 'tray-32x32.png'

  // 尝试多个路径（生产模式 vs 开发模式）
  const candidates = [
    path.join(__dirname, '../../resources/icons', iconName),
    path.join(app.getAppPath(), 'resources/icons', iconName),
  ]

  let trayIcon: Electron.NativeImage = nativeImage.createEmpty()
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) { trayIcon = img; break }
  }
  // 不设置 Template — 直接显示彩色图标（紫色 S 设计在深浅色菜单栏都清晰可见）

  tray = new Tray(trayIcon)
  tray.setToolTip('STerminal')

  // 点击托盘图标：macOS 始终显示窗口，Windows/Linux 切换显示/隐藏
  tray.on('click', () => {
    if (process.platform === 'darwin') {
      // macOS：点击托盘始终显示并聚焦，不做隐藏
      mainWindow.show()
      mainWindow.focus()
    } else {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  // 构建右键菜单
  updateTrayMenu(mainWindow)
}

/**
 * 更新托盘菜单（主机列表变化时调用）
 */
export function updateTrayMenu(mainWindow: BrowserWindow): void {
  if (!tray) return

  // 从数据库读取最近连接的主机（最多 10 个）
  let recentHosts: { id: string; label: string; address: string; port: number; username: string }[] = []
  try {
    recentHosts = dbAll<{ id: string; label: string; address: string; port: number; username: string }>(
      `SELECT id, COALESCE(label, address) as label, address, port, COALESCE(username, 'root') as username
       FROM hosts
       WHERE last_connected IS NOT NULL
       ORDER BY last_connected DESC
       LIMIT 10`
    )
  } catch {
    // DB 未初始化时静默忽略
  }

  const hostMenuItems: Electron.MenuItemConstructorOptions[] = recentHosts.map(host => ({
    label: `${host.label} (${host.username}@${host.address}:${host.port})`,
    click: () => {
      mainWindow.show()
      mainWindow.focus()
      // 通过 IPC 通知渲染进程打开 SSH 连接
      mainWindow.webContents.send('system:tray-connect', { hostId: host.id })
    },
  }))

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'STerminal',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: process.platform === 'darwin' ? '显示窗口' : 'Show Window',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    {
      label: process.platform === 'darwin' ? '新建终端' : 'New Terminal',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('system:tray-new-terminal')
      },
    },
  ]

  // 快速连接子菜单（有最近主机时才显示）
  if (hostMenuItems.length > 0) {
    template.push({ type: 'separator' })
    template.push({
      label: process.platform === 'darwin' ? '快速连接' : 'Quick Connect',
      submenu: hostMenuItems,
    })
  }

  template.push({ type: 'separator' })
  template.push({
    label: process.platform === 'darwin' ? '退出 STerminal' : 'Quit STerminal',
    click: () => {
      isQuitting = true
      app.quit()
    },
  })

  const contextMenu = Menu.buildFromTemplate(template)
  tray.setContextMenu(contextMenu)
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
