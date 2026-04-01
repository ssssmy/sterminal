// 操作审计服务 — 记录关键操作到 audit_logs 表
// 写入失败不阻塞主流程（静默忽略）

import { v4 as uuidv4 } from 'uuid'
import { dbRun, dbAll, dbGet } from './db'

export type AuditCategory = 'connection' | 'transfer' | 'config' | 'security' | 'system'

export type AuditEventType =
  | 'ssh.connect' | 'ssh.disconnect' | 'ssh.error'
  | 'sftp.upload' | 'sftp.download' | 'sftp.delete' | 'sftp.mkdir'
  | 'host.create' | 'host.update' | 'host.delete'
  | 'key.generate' | 'key.import' | 'key.deploy' | 'key.delete'
  | 'vault.create' | 'vault.delete'
  | 'settings.change'
  | 'auth.login' | 'auth.logout'
  | 'data.import' | 'data.export' | 'data.clear'

export interface AuditEvent {
  eventType: AuditEventType
  category: AuditCategory
  summary: string
  detail?: string
  hostId?: string
  hostLabel?: string
}

export interface AuditLogRow {
  id: string
  event_type: string
  category: string
  summary: string
  detail: string | null
  host_id: string | null
  host_label: string | null
  created_at: string
}

/**
 * 记录一条审计日志（写入失败静默忽略）
 */
export function logAuditEvent(event: AuditEvent): void {
  try {
    dbRun(
      `INSERT INTO audit_logs (id, event_type, category, summary, detail, host_id, host_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), event.eventType, event.category, event.summary, event.detail ?? null, event.hostId ?? null, event.hostLabel ?? null]
    )
  } catch {
    // 审计写入失败不阻塞主流程
  }
}

/**
 * 查询审计日志（分页 + 过滤）
 */
export function queryAuditLogs(params: {
  category?: string
  eventType?: string
  search?: string
  limit?: number
  offset?: number
}): { rows: AuditLogRow[]; total: number } {
  const conditions: string[] = []
  const args: unknown[] = []

  if (params.category) {
    conditions.push('category = ?')
    args.push(params.category)
  }
  if (params.eventType) {
    conditions.push('event_type = ?')
    args.push(params.eventType)
  }
  if (params.search) {
    conditions.push('(summary LIKE ? OR detail LIKE ? OR host_label LIKE ?)')
    const like = `%${params.search}%`
    args.push(like, like, like)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const countRow = dbGet<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM audit_logs ${where}`, args)
  const total = countRow?.cnt ?? 0

  const limit = params.limit || 50
  const offset = params.offset || 0
  const rows = dbAll<AuditLogRow>(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...args, limit, offset]
  )

  return { rows, total }
}

/**
 * 导出审计日志为 JSON 数组
 */
export function exportAuditLogs(params?: { category?: string }): AuditLogRow[] {
  if (params?.category) {
    return dbAll<AuditLogRow>('SELECT * FROM audit_logs WHERE category = ? ORDER BY created_at DESC', [params.category])
  }
  return dbAll<AuditLogRow>('SELECT * FROM audit_logs ORDER BY created_at DESC')
}

/**
 * 清理过期审计日志
 */
export function cleanAuditLogs(retainDays: number): number {
  const result = dbRun(
    `DELETE FROM audit_logs WHERE created_at < datetime('now', ? || ' days')`,
    [`-${retainDays}`]
  )
  return result.changes
}

/**
 * 清空所有审计日志
 */
export function clearAuditLogs(): void {
  dbRun('DELETE FROM audit_logs')
}
