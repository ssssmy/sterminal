// 会话录制服务
// 管理 asciicast v2 格式的终端录制文件

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { dbRun, dbGet, dbAll } from './db'
import { getDefaultShell } from '../utils/platform'

interface ActiveRecording {
  logId: string
  filePath: string
  stream: fs.WriteStream
  startTime: number // Date.now() 毫秒
}

// 活跃录制：key 为 ptyId 或 sshConnectionId
const activeRecordings = new Map<string, ActiveRecording>()

export function getLogDirectory(): string {
  const row = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['log.directory'])
  if (row?.value) {
    try {
      const dir = JSON.parse(row.value) as string
      if (dir) return dir
    } catch { /* use default */ }
  }
  return path.join(app.getPath('home'), 'STerminal', 'logs')
}

/**
 * 开始录制
 */
export function startRecording(params: {
  terminalKey: string // ptyId 或 sshConnectionId
  cols: number
  rows: number
  label?: string
  hostId?: string
  localTerminalId?: string
}): { logId: string } {
  if (activeRecordings.has(params.terminalKey)) {
    // 已经在录制
    const existing = activeRecordings.get(params.terminalKey)!
    return { logId: existing.logId }
  }

  const logDir = getLogDirectory()
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  const logId = uuidv4()
  const now = new Date()
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeLabel = (params.label || 'session').replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, '_').slice(0, 50)
  const fileName = `${safeLabel}_${dateStr}.cast`
  const filePath = path.join(logDir, fileName)

  const stream = fs.createWriteStream(filePath, { encoding: 'utf-8' })

  // asciicast v2 header
  const header = {
    version: 2,
    width: params.cols,
    height: params.rows,
    timestamp: Math.floor(now.getTime() / 1000),
    title: params.label || 'STerminal Recording',
    env: { TERM: 'xterm-256color', SHELL: getDefaultShell() },
  }
  stream.write(JSON.stringify(header) + '\n')

  const startTime = Date.now()
  activeRecordings.set(params.terminalKey, { logId, filePath, stream, startTime })

  // 写入 DB
  const startedAt = now.toISOString()
  dbRun(
    `INSERT INTO session_logs (id, host_id, local_terminal_id, host_label, file_path, format, started_at)
     VALUES (?, ?, ?, ?, ?, 'asciicast', ?)`,
    [logId, params.hostId ?? null, params.localTerminalId ?? null, params.label ?? null, filePath, startedAt]
  )

  return { logId }
}

/**
 * 录制输出数据（由 PTY/SSH data handler 调用）
 */
export function recordData(terminalKey: string, data: string): void {
  const rec = activeRecordings.get(terminalKey)
  if (!rec) return

  const elapsed = (Date.now() - rec.startTime) / 1000 // 秒
  // asciicast v2 event: [time, type, data]
  const event = JSON.stringify([parseFloat(elapsed.toFixed(6)), 'o', data])
  rec.stream.write(event + '\n')
}

/**
 * 停止录制
 */
export function stopRecording(terminalKey: string): { logId: string } | null {
  const rec = activeRecordings.get(terminalKey)
  if (!rec) return null

  activeRecordings.delete(terminalKey)

  const logId = rec.logId
  const filePath = rec.filePath

  // 等待流完全写完再读取文件大小
  rec.stream.end(() => {
    const endedAt = new Date().toISOString()
    let fileSize = 0
    try {
      fileSize = fs.statSync(filePath).size
    } catch { /* ignore */ }
    dbRun(
      'UPDATE session_logs SET ended_at = ?, file_size = ? WHERE id = ?',
      [endedAt, fileSize, logId]
    )
  })

  return { logId }
}

/**
 * 检查是否正在录制
 */
export function isRecording(terminalKey: string): boolean {
  return activeRecordings.has(terminalKey)
}

/**
 * 获取录制列表
 */
export function listRecordings(): Record<string, unknown>[] {
  return dbAll('SELECT * FROM session_logs ORDER BY started_at DESC')
}

/**
 * 删除录制
 */
export function deleteRecording(logId: string): boolean {
  const row = dbGet<{ file_path: string }>('SELECT file_path FROM session_logs WHERE id = ?', [logId])
  if (row?.file_path) {
    try { fs.unlinkSync(row.file_path) } catch { /* file may not exist */ }
  }
  dbRun('DELETE FROM session_logs WHERE id = ?', [logId])
  return true
}

/**
 * 获取回放数据
 */
export function getReplayData(logId: string): string | null {
  const row = dbGet<{ file_path: string }>('SELECT file_path FROM session_logs WHERE id = ?', [logId])
  if (!row?.file_path) return null
  try {
    return fs.readFileSync(row.file_path, 'utf-8')
  } catch {
    return null
  }
}

/**
 * 停止所有录制（应用退出时调用）
 */
export function stopAllRecordings(): void {
  const keys = [...activeRecordings.keys()]
  for (const key of keys) {
    try {
      stopRecording(key)
    } catch (e) {
      console.error('[Recorder] stop failed:', key, e)
    }
  }
}
