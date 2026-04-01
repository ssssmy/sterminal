// 补全系统类型定义 — 后期可接入 AI Provider 扩展

export interface CompletionItem {
  /** 补全文本（插入到终端的内容） */
  text: string
  /** 显示标签（列表中显示） */
  label: string
  /** 来源类型 */
  source: 'history' | 'snippet' | 'command' | 'ai'
  /** 说明/参数提示 */
  description?: string
  /** 匹配分数（越高越靠前） */
  score: number
  /** 图标提示 */
  icon?: string
}

export interface CompletionRequest {
  /** 当前输入的文本（光标前的内容） */
  input: string
  /** 关联的主机 ID（SSH 模式时有值） */
  hostId?: string
  /** 终端类型 */
  terminalType: 'local' | 'ssh'
  /** 最大返回数量 */
  limit?: number
}

/**
 * 补全提供器接口 — 后期 AI 扩展只需实现此接口
 */
export interface CompletionProvider {
  readonly name: string
  readonly priority: number // 越小越优先
  getCompletions(request: CompletionRequest): CompletionItem[]
}
