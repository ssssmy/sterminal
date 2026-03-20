// 命令片段相关类型定义

export interface Snippet {
  id: string
  name: string
  content: string
  description?: string
  tags: string[]
  groupId?: string
  sortOrder: number
  useCount: number
  lastUsedAt?: string
}

export interface SnippetGroup {
  id: string
  name: string
  parentId?: string
  color?: string
  sortOrder: number
}
