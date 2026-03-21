// 会话日志录制 IPC Handler

import { ipcMain, shell } from 'electron'
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
import { assertUnderHome } from '../utils/platform'

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
    const resolved = assertUnderHome(dir)
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true })
    }
    return shell.openPath(resolved)
  })
}
