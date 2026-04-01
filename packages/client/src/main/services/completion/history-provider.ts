// 命令历史补全提供器

import { dbAll, dbRun } from '../db'
import type { CompletionProvider, CompletionRequest, CompletionItem } from './types'

export class HistoryProvider implements CompletionProvider {
  readonly name = 'history'
  readonly priority = 1

  getCompletions(request: CompletionRequest): CompletionItem[] {
    const { input, hostId, limit = 10 } = request
    if (!input || input.length < 2) return []

    const like = `${input}%`
    // 按频次和最近使用排序，去重
    const rows = dbAll<{ command: string; cnt: number }>(
      `SELECT command, COUNT(*) as cnt FROM command_history
       WHERE command LIKE ? ${hostId ? 'AND host_id = ?' : ''}
       GROUP BY command ORDER BY cnt DESC, MAX(created_at) DESC LIMIT ?`,
      hostId ? [like, hostId, limit] : [like, limit]
    )

    return rows.map((row, i) => ({
      text: row.command,
      label: row.command,
      source: 'history' as const,
      description: `used ${row.cnt}x`,
      score: 100 - i,
    }))
  }

  /** 记录命令到历史 */
  static record(command: string, hostId?: string): void {
    if (!command.trim()) return
    try {
      dbRun(
        'INSERT INTO command_history (command, host_id) VALUES (?, ?)',
        [command.trim(), hostId ?? null]
      )
      // 保留最近 5000 条
      dbRun(
        `DELETE FROM command_history WHERE id NOT IN (
          SELECT id FROM command_history ORDER BY created_at DESC LIMIT 5000
        )`
      )
    } catch { /* silent */ }
  }
}
