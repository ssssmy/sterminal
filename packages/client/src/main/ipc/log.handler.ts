// 会话日志录制 IPC Handler

import { ipcMain, shell, app } from 'electron'
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
  getLogDirectory,
} from '../services/session-recorder'

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
  ipcMain.handle(IPC_LOG.OPEN_DIRECTORY, () => {
    const dir = getLogDirectory()
    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    // 路径校验：仅允许打开用户目录下的路径
    const resolved = path.resolve(dir)
    const homeDir = app.getPath('home')
    if (!resolved.startsWith(homeDir)) {
      throw new Error('Access denied: path outside home directory')
    }
    return shell.openPath(resolved)
  })
}
