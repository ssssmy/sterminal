// 补全引擎 — 聚合所有 Provider 的结果
// 后期接入 AI 只需 registerProvider(new AIProvider())

import type { CompletionProvider, CompletionRequest, CompletionItem } from './types'
import { HistoryProvider } from './history-provider'
import { SnippetProvider } from './snippet-provider'
import { CommandProvider } from './command-provider'

class CompletionEngine {
  private providers: CompletionProvider[] = []

  constructor() {
    // 内置 provider（按 priority 排序）
    this.registerProvider(new HistoryProvider())
    this.registerProvider(new SnippetProvider())
    this.registerProvider(new CommandProvider())
  }

  /**
   * 注册补全提供器（AI 扩展入口）
   */
  registerProvider(provider: CompletionProvider): void {
    this.providers.push(provider)
    this.providers.sort((a, b) => a.priority - b.priority)
  }

  /**
   * 获取补全建议
   */
  getCompletions(request: CompletionRequest): CompletionItem[] {
    const limit = request.limit || 12
    const allItems: CompletionItem[] = []

    for (const provider of this.providers) {
      try {
        const items = provider.getCompletions(request)
        allItems.push(...items)
      } catch {
        // Provider 出错不影响其他 provider
      }
    }

    // 去重（同一 text 只保留分数最高的）
    const seen = new Map<string, CompletionItem>()
    for (const item of allItems) {
      const existing = seen.get(item.text)
      if (!existing || item.score > existing.score) {
        seen.set(item.text, item)
      }
    }

    // 按分数排序，截断
    return Array.from(seen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

// 单例
export const completionEngine = new CompletionEngine()
