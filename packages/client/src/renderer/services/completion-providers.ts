// 内置补全源：命令历史 + 命令片段
// AI 补全源将在后期作为独立模块实现

import type { CompletionProvider, CompletionContext, CompletionItem } from './completion-service'
import { IPC_DB } from '@shared/types/ipc-channels'

const ipc = window.electronAPI?.ipc

// ===== 命令历史补全 =====

export class HistoryCompletionProvider implements CompletionProvider {
  id = 'history'
  label = 'History'
  enabled = true

  private cache: { command: string; host_id: string | null; created_at: string }[] = []
  private lastFetch = 0

  async provide(context: CompletionContext): Promise<CompletionItem[]> {
    // 缓存 5 秒，避免频繁 IPC
    if (Date.now() - this.lastFetch > 5000 || this.cache.length === 0) {
      try {
        const rows = await ipc?.invoke(IPC_DB.CMD_HISTORY_LIST, {
          limit: 200,
          hostId: context.hostId,
        }) as { command: string; host_id: string | null; created_at: string }[] | undefined
        this.cache = rows ?? []
        this.lastFetch = Date.now()
      } catch {
        // 静默忽略
      }
    }

    const input = context.input.toLowerCase()
    const items: CompletionItem[] = []
    const seen = new Set<string>()

    for (const row of this.cache) {
      const cmd = row.command.trim()
      if (!cmd || seen.has(cmd)) continue
      if (!cmd.toLowerCase().includes(input)) continue
      seen.add(cmd)

      // 前缀匹配比包含匹配得分更高
      const isPrefix = cmd.toLowerCase().startsWith(input)
      items.push({
        label: cmd,
        insertText: cmd,
        source: 'history',
        sourceLabel: '历史',
        score: isPrefix ? 80 : 40,
      })

      if (items.length >= 10) break
    }

    return items
  }
}

// ===== 命令片段补全 =====

export class SnippetCompletionProvider implements CompletionProvider {
  id = 'snippet'
  label = 'Snippets'
  enabled = true

  private cache: { name: string; content: string; description?: string; use_count: number }[] = []
  private lastFetch = 0

  async provide(context: CompletionContext): Promise<CompletionItem[]> {
    if (Date.now() - this.lastFetch > 10000 || this.cache.length === 0) {
      try {
        const rows = await ipc?.invoke(IPC_DB.SNIPPETS_LIST) as any[] | undefined
        this.cache = (rows ?? []).map(r => ({
          name: r.name,
          content: r.content,
          description: r.description,
          use_count: r.use_count || 0,
        }))
        this.lastFetch = Date.now()
      } catch {
        // 静默忽略
      }
    }

    const input = context.input.toLowerCase()
    const items: CompletionItem[] = []

    for (const snippet of this.cache) {
      const nameMatch = snippet.name.toLowerCase().includes(input)
      const contentMatch = snippet.content.toLowerCase().includes(input)
      if (!nameMatch && !contentMatch) continue

      items.push({
        label: snippet.name,
        insertText: snippet.content,
        source: 'snippet',
        sourceLabel: '片段',
        description: snippet.description || undefined,
        // 片段按使用频率加权
        score: (nameMatch ? 70 : 30) + Math.min(snippet.use_count, 20),
      })

      if (items.length >= 8) break
    }

    return items
  }
}
