// 终端配置与会话相关类型定义

export interface LocalTerminalConfig {
  id: string
  name: string
  icon?: string
  color?: string
  shell?: string
  shellArgs?: string[]
  cwd?: string
  startupScript?: string
  startupCommand?: string
  scriptLineDelay: number
  environment?: Record<string, string>
  loginShell: boolean
  terminalTheme?: string
  fontFamily?: string
  fontSize?: number
  cursorStyle?: 'block' | 'underline' | 'bar'
  cursorBlink?: boolean
  groupId?: string
  sortOrder: number
  isDefault: boolean
}

export interface LocalTerminalGroup {
  id: string
  name: string
  parentId?: string
  sortOrder: number
}

// 标签页内的分屏使用树形结构
export interface TabSession {
  id: string
  label: string
  color?: string
  pinned: boolean
  root: SplitNode
}

// 分屏节点类型（递归树）
export type SplitNode =
  | { type: 'terminal'; terminalId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; ratio: number; children: [SplitNode, SplitNode] }

// 运行时终端实例（含 xterm.js 引用）
export interface TerminalInstance {
  id: string
  type: 'local' | 'ssh'
  // local 类型字段
  localConfigId?: string
  shell?: string
  cwd?: string
  // ssh 类型字段
  hostId?: string
  sshConnectionId?: string
  // PTY 进程 ID（本地终端启动后赋值）
  ptyId?: string
  // 共享字段
  recording: boolean
}
