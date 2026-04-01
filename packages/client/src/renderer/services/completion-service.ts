// 终端自动补全服务 — 插件式架构，支持多补全源
//
// 补全源接口设计为可扩展，后期接入 AI 补全只需实现 CompletionProvider 即可：
//   class AiCompletionProvider implements CompletionProvider {
//     id = 'ai'
//     async provide(context) { return await llm.complete(context) }
//   }
//   completionService.registerProvider(new AiCompletionProvider())

export interface CompletionContext {
  /** 当前输入的部分文本（光标前的内容） */
  input: string
  /** 当前连接的 hostId（SSH 模式下有值） */
  hostId?: string
  /** 终端类型 */
  terminalType: 'local' | 'ssh'
}

export interface CompletionItem {
  /** 显示文本 */
  label: string
  /** 插入到终端的文本 */
  insertText: string
  /** 补全来源标识 */
  source: string
  /** 来源显示名 */
  sourceLabel: string
  /** 可选描述/备注 */
  description?: string
  /** 排序权重（越大越靠前） */
  score: number
}

export interface CompletionProvider {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  label: string
  /** 是否启用 */
  enabled: boolean
  /** 提供补全建议（返回空数组表示无建议） */
  provide(context: CompletionContext): Promise<CompletionItem[]>
}

class CompletionService {
  private providers: Map<string, CompletionProvider> = new Map()

  registerProvider(provider: CompletionProvider): void {
    this.providers.set(provider.id, provider)
  }

  unregisterProvider(id: string): void {
    this.providers.delete(id)
  }

  getProviders(): CompletionProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * 从所有启用的 provider 获取补全建议，合并后按 score 排序
   */
  async complete(context: CompletionContext, maxResults = 10): Promise<CompletionItem[]> {
    if (!context.input.trim() || context.input.length < 2) return []

    const results = await Promise.allSettled(
      Array.from(this.providers.values())
        .filter(p => p.enabled)
        .map(p => p.provide(context))
    )

    const items: CompletionItem[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        items.push(...result.value)
      }
    }

    // 去重（相同 insertText 取 score 最高的）
    const seen = new Map<string, CompletionItem>()
    for (const item of items) {
      const existing = seen.get(item.insertText)
      if (!existing || item.score > existing.score) {
        seen.set(item.insertText, item)
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, maxResults)
  }
}

// 单例
export const completionService = new CompletionService()
