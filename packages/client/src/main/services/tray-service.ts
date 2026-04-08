// 系统托盘服务 — 跨平台（macOS / Windows / Linux）
// 最小化到托盘、快速连接菜单、显示/退出

import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { dbAll } from './db'

// 内嵌托盘图标 base64（彻底绕开文件路径问题）
const TRAY_ICON_WIN = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRABjAGYA8aExw/oAAAAHdElNRQfqBAgLMRJyjoVwAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA0LTA4VDA5OjEyOjEyKzAwOjAw/c26fQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNC0wOFQwOToxMjoxMiswMDowMIyQAsEAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDQtMDhUMTE6NDk6MTgrMDA6MDAxThn+AAABUElEQVQ4y6WTvU4CQRSFvzv7A1IgQSN2WmiihUEttYLKn1pfwIT4ZMZ30GgjGistRGMUK4hWAg0BdnfGYmVdEiNruNXMJHPud87ckaNKxzBBqUkujwgYwBhIpQTXFUxCLnu4SKeEcsmluGajNdzcelSvB2idgEBrWF2x2N9zeXr2ea37bG85zM6osSQRgeeBDmC+oHio+dzd9/hsaUQSECgF9beAk9MefgC7OykOD9JMZ8cTRBbWizabGw5n5wMuLgcsLlgUCgktiECjqSmXhOPKFEqg9ujTaAaIhK8TD1MpImsyHCRjIJsVCnMKreH9Q9Pthu3zecXykoVIKPTy4tNqG0RiIQJ0OoZ2O4i6DIUdG3I5QQloA7Yj35MTE8hkBMv63We3a7iqetE+CH4sRBm4DuEE/p0ZAvT7hn4/JmAMtDsmwkpSIwTxg//WxL/xCxSYflAjlSI8AAAAAElFTkSuQmCC'
const TRAY_ICON_MAC = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAAGVSURBVDiNnZPNK0RRGIefe+69M1MyPhZoZvbYMD62RMrnQkpIWSl7imShZEfRpERZyX9A+YpkIcXKTKwwyELNZpi5cufeGYvpXiMzvn6r9+2c33Pe877nSMMj0TJgDmgFSvmdnoA9YEIBFoGBXxotlQJDgCqAjj+aM9WhAAVW5nRKtLU68HkFsizx+Giyu68Tj6dyAQoUK5JlmJrMw+sRaFraUF2lUF+nMj0TwzCyE2xARbmC1yOIRJLMzMZBgsEBF8XFAp9PJhw2vwdYpxYWChoaVO7uTNY3Xkkkvm+CDbgNmxwd6zQ1OujrdQEQi6fY3Hrj4FDPCZCGR6KfOlRUJKgsl/H7VWpr0vzAkkYwlL0Jwgp6up2srbppaXZwcppgeUXj7Dxdv9cjspo/XeEiaNDV6aS9zUFJicAwUvirVQDuH5I/A65vTAJLGv19Lrv0SCTJ0bHO5VWOGWYCAIIhg2Ao9mXTwnw+brdk58/PKcbGX2xANPM1ZtP+gY6qfuQZo40qwPZPn2l75y3nkgKMAon/fud36qd/LOJFZDYAAAAASUVORK5CYII='
const TRAY_ICON_LINUX = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAEjUExURWNm8WFk8WJl8WVo8Wls8pOV9b2++c7P+8zN+rS1+IOG9G1v8sHD+fv7//////Hx/p6g9qWn9+np/cLD+srL+vX1/u7v/Xx/82Fl8V9i8WRn8amr9+nq/efo/ZCS9cnK+v7+/72/+Xx+82Zp8XBz8nJ18pia9vj4/vDx/tnZ/Le5+YeJ9Jud9t7e/PX2/rCy+Gdq8W5x8omL9Kep98vM+vn5/nFz8ry9+aao96yu+LGy+G9y8uTl/ZaY9nF08nd588LD+aus9+jo/e3t/e/v/oKE9Gtu8rK0+O3u/f39/+Hi/JWX9nl885WX9aKk96Ci9o6Q9WBj8cXG+sTF+pKV9a+x+Ovs/evr/aiq92hr8Wxv8nZ583Z482pt8np8846R9XV481++FR0AAAABYktHRACIBR1IAAAAB3RJTUUH6gQICwgXDGD8RQAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wNC0wOFQwOToxMjoxMiswMDowMP3Nun0AAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDQtMDhUMDk6MTI6MTIrMDA6MDCMkALBAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA0LTA4VDExOjA4OjIzKzAwOjAw4t1SWwAAAPJJREFUOMtjYBhCgJGJmZmREac0EwsrGzsHJxdOeW4eXj4g4BfAZb4gH5+QsIgon5i4BFYFzBx8vKySUtIysnLYnSElz6egqMSirKLKgsMKNXU+Pg1NLW0pJhyOYNbRBSrh09M3wOkPQyNjE1E+U+xuYDIzl7dglGSw5OOzwq7A2oaP39bO3oGPzxG7L5iAek2dnBX4XFxxKHBz9/Dk4+P18sbpRikfXz//ADuIL6F+RfUyU2BgICNUXi0oGAiCQnAFClNomAwQhEfgjH0WOzCIRNKDBhjBAMmGqOgYTBAdEwtXEBcfgA0kIMyQwgoYhg8AAPUGKcJOsJ7iAAAAAElFTkSuQmCC'

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

  // 托盘图标：内嵌 base64，彻底绕开文件路径和 asar 问题
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'
  const b64 = isMac ? TRAY_ICON_MAC : isWin ? TRAY_ICON_WIN : TRAY_ICON_LINUX
  const trayIcon = nativeImage.createFromBuffer(Buffer.from(b64, 'base64'))
  console.log(`[Tray] Icon loaded from embedded base64 (${trayIcon.getSize().width}x${trayIcon.getSize().height})`)

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
