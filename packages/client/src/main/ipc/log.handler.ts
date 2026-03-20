// 会话日志录制 IPC Handler

import { ipcMain, shell } from 'electron'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { IPC_LOG } from '../../shared/types/ipc-channels'
import {
  startRecording,
  stopRecording,
  isRecording,
  listRecordings,
  deleteRecording,
  getReplayData,
} from '../services/session-recorder'
import { dbGet } from '../services/db'

export function registerLogHandlers(): void {
  ipcMain.handle(IPC_LOG.START, (_event, params: {
    terminalKey: string
    cols: number
    rows: number
    label?: string
    hostId?: string
    localTerminalId?: string
  }) => {
    return startRecording(params)
  })

  ipcMain.handle(IPC_LOG.STOP, (_event, params: { terminalKey: string }) => {
    return stopRecording(params.terminalKey)
  })

  ipcMain.handle(IPC_LOG.IS_RECORDING, (_event, params: { terminalKey: string }) => {
    return isRecording(params.terminalKey)
  })

  ipcMain.handle(IPC_LOG.LIST, () => {
    return listRecordings()
  })

  ipcMain.handle(IPC_LOG.DELETE, (_event, params: { logId: string }) => {
    return deleteRecording(params.logId)
  })

  ipcMain.handle(IPC_LOG.REPLAY, (_event, params: { logId: string }) => {
    return getReplayData(params.logId)
  })

  // 打开录制文件夹（跨平台：Finder / Explorer / Files）
  ipcMain.handle(IPC_LOG.OPEN_DIRECTORY, (_event, customDir?: string) => {
    let dir = customDir || ''
    if (!dir) {
      // 从设置读取
      const row = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['log.directory'])
      if (row?.value) {
        try { dir = JSON.parse(row.value) as string } catch { /* ignore */ }
      }
    }
    if (!dir) {
      dir = path.join(app.getPath('home'), 'STerminal', 'logs')
    }
    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return shell.openPath(dir)
  })
}
