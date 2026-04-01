// 命令片段补全提供器

import { dbAll } from '../db'
import type { CompletionProvider, CompletionRequest, CompletionItem } from './types'

export class SnippetProvider implements CompletionProvider {
  readonly name = 'snippet'
  readonly priority = 2

  getCompletions(request: CompletionRequest): CompletionItem[] {
    const { input, limit = 8 } = request
    if (!input || input.length < 1) return []

    const like = `%${input}%`
    const rows = dbAll<{ name: string; content: string; description: string | null; use_count: number }>(
      `SELECT name, content, description, use_count FROM snippets
       WHERE name LIKE ? OR content LIKE ?
       ORDER BY use_count DESC LIMIT ?`,
      [like, like, limit]
    )

    return rows.map((row, i) => ({
      text: row.content,
      label: row.name,
      source: 'snippet' as const,
      description: row.description || row.content.slice(0, 60),
      score: 80 - i,
      icon: '⚡',
    }))
  }
}
