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
  startTime: number
  bytesWritten: number
  maxFileSize: number
}

// 活跃录制：key 为 ptyId 或 sshConnectionId
const activeRecordings = new Map<string, ActiveRecording>()

// ===== 设置读取 =====

function getSetting<T>(key: string, fallback: T): T {
  const row = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  if (row?.value) {
    try { return JSON.parse(row.value) as T } catch { /* use fallback */ }
  }
  return fallback
}

export function getLogDirectory(): string {
  const dir = getSetting<string>('log.directory', '')
  if (dir) return dir
  return path.join(app.getPath('home'), 'STerminal', 'logs')
}

function getFileNameTemplate(): string {
  return getSetting<string>('log.fileNameTemplate', '{host}_{datetime}.log')
}

function getMaxFileSize(): number {
  return getSetting<number>('log.maxFileSize', 52428800)
}

function isAutoRecord(): boolean {
  return getSetting<boolean>('log.autoRecord', false)
}

function getFormat(): string {
  return getSetting<string>('log.format', 'text')
}

function shouldAddTimestamp(): boolean {
  return getSetting<boolean>('log.timestamp', false)
}

// ===== 文件名生成 =====

function generateFileName(label: string, template: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const datetime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const safeHost = (label || 'session').replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, '_').slice(0, 50)

  let name = template
    .replace(/\{host\}/g, safeHost)
    .replace(/\{datetime\}/g, datetime)

  // 确保文件名安全
  name = name.replace(/[<>:"/\\|?*]/g, '_')
  return name
}

/**
 * 检查是否应该自动录制
 */
export function shouldAutoRecord(): boolean {
  return isAutoRecord()
}

/**
 * 开始录制
 */
export function startRecording(params: {
  terminalKey: string
  cols: number
  rows: number
  label?: string
  hostId?: string
  localTerminalId?: string
}): { logId: string } {
  if (activeRecordings.has(params.terminalKey)) {
    const existing = activeRecordings.get(params.terminalKey)!
    return { logId: existing.logId }
  }

  const logDir = getLogDirectory()
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  const logId = uuidv4()
  const format = getFormat()
  const template = getFileNameTemplate()
  const maxFileSize = getMaxFileSize()

  // 生成文件名
  let fileName = generateFileName(params.label || 'session', template)
  // 确保扩展名匹配格式
  if (format === 'asciicast' && !fileName.endsWith('.cast')) {
    fileName = fileName.replace(/\.[^.]*$/, '') + '.cast'
  } else if (format === 'text' && !fileName.endsWith('.log') && !fileName.endsWith('.txt')) {
    fileName = fileName.replace(/\.[^.]*$/, '') + '.log'
  }

  const filePath = path.join(logDir, fileName)
  const stream = fs.createWriteStream(filePath, { encoding: 'utf-8' })

  if (format === 'asciicast') {
    // asciicast v2 header
    const header = {
      version: 2,
      width: params.cols,
      height: params.rows,
      timestamp: Math.floor(Date.now() / 1000),
      title: params.label || 'STerminal Recording',
      env: { TERM: 'xterm-256color', SHELL: getDefaultShell() },
    }
    stream.write(JSON.stringify(header) + '\n')
  }

  const startTime = Date.now()
  activeRecordings.set(params.terminalKey, {
    logId, filePath, stream, startTime,
    bytesWritten: 0,
    maxFileSize,
  })

  // 写入 DB
  dbRun(
    `INSERT INTO session_logs (id, host_id, local_terminal_id, host_label, file_path, format, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [logId, params.hostId ?? null, params.localTerminalId ?? null, params.label ?? null, filePath, format, new Date().toISOString()]
  )

  return { logId }
}

/**
 * 录制输出数据（由 PTY/SSH data handler 调用）
 */
export function recordData(terminalKey: string, data: string): void {
  const rec = activeRecordings.get(terminalKey)
  if (!rec) return

  // 大小上限检查
  rec.bytesWritten += Buffer.byteLength(data, 'utf-8')
  if (rec.bytesWritten > rec.maxFileSize) {
    stopRecording(terminalKey)
    return
  }

  const format = getSetting<string>('log.format', 'text')
  const addTimestamp = shouldAddTimestamp()

  if (format === 'asciicast') {
    const elapsed = (Date.now() - rec.startTime) / 1000
    const event = JSON.stringify([parseFloat(elapsed.toFixed(6)), 'o', data])
    rec.stream.write(event + '\n')
  } else {
    // 纯文本格式
    if (addTimestamp) {
      const now = new Date()
      const ts = `[${now.toISOString().slice(11, 19)}] `
      // 给每行加时间戳
      const lines = data.split('\n')
      const stamped = lines.map((line, i) =>
        i < lines.length - 1 || line ? ts + line : line
      ).join('\n')
      rec.stream.write(stamped)
    } else {
      rec.stream.write(data)
    }
  }
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

/**
 * 自动清理过期录制文件
 */
export function autoCleanRecordings(): void {
  const autoClean = getSetting<boolean>('log.autoClean', false)
  if (!autoClean) return

  const retainDays = getSetting<number>('log.retainDays', 90)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retainDays)
  const cutoffStr = cutoff.toISOString()

  const expired = dbAll<{ id: string; file_path: string }>(
    'SELECT id, file_path FROM session_logs WHERE started_at < ? AND ended_at IS NOT NULL',
    [cutoffStr]
  )

  for (const row of expired) {
    if (row.file_path) {
      try { fs.unlinkSync(row.file_path) } catch { /* ignore */ }
    }
    dbRun('DELETE FROM session_logs WHERE id = ?', [row.id])
  }
}
