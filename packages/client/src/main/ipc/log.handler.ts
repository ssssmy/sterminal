// 会话日志录制 IPC Handler

import { ipcMain, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
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
import { exportToGif } from '../services/gif-exporter'
import { queryAuditLogs, exportAuditLogs, cleanAuditLogs, clearAuditLogs } from '../services/audit-service'
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

  // 导出录制为 GIF 动画
  ipcMain.handle(IPC_LOG.EXPORT_GIF, async (_event, params: {
    logId: string
    outputPath: string
    fps?: number
    watermark?: string
  }) => {
    // 获取 asciicast 文件路径
    const replayData = await getReplayData(params.logId)
    if (!replayData) throw new Error('Recording not found')

    // getReplayData 返回文件内容字符串，需要先写到临时文件
    const tmpDir = path.join(getLogDirectory(), '.tmp')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    const tmpFile = path.join(tmpDir, `${params.logId}.cast`)
    fs.writeFileSync(tmpFile, replayData)

    try {
      const result = await exportToGif({
        inputPath: tmpFile,
        outputPath: params.outputPath,
        fps: params.fps || 10,
        watermark: params.watermark ?? 'STerminal',
      })
      return result
    } finally {
      // 清理临时文件
      try { fs.rmSync(tmpFile, { force: true }) } catch { /* ignore */ }
    }
  })

  // ===== 审计日志 =====

  ipcMain.handle(IPC_LOG.AUDIT_LIST, (_event, params: {
    category?: string
    eventType?: string
    search?: string
    limit?: number
    offset?: number
  }) => {
    return queryAuditLogs(params)
  })

  ipcMain.handle(IPC_LOG.AUDIT_EXPORT, (_event, params?: { category?: string }) => {
    return exportAuditLogs(params)
  })

  ipcMain.handle(IPC_LOG.AUDIT_CLEAN, (_event, retainDays: number) => {
    return cleanAuditLogs(retainDays)
  })

  ipcMain.handle(IPC_LOG.AUDIT_CLEAR, () => {
    clearAuditLogs()
    return true
  })
}
