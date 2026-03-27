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
  // SFTP 支持
  contentType?: 'terminal' | 'sftp'
  sftpMeta?: {
    connectionId: string
    hostId: string
    hostLabel: string
  }
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
  sshStatus?: 'connecting' | 'connected' | 'disconnected' | 'error'
  // PTY 进程 ID（本地终端启动后赋值）
  ptyId?: string
  // 远端操作系统（SSH 连接成功后检测）
  remoteOS?: 'darwin' | 'windows' | 'linux'
  // SSH 健康探针数据
  healthRtt?: number       // RTT 毫秒，-1 表示超时/不支持
  healthStatus?: 'ok' | 'timeout' | 'unsupported'
  // 共享字段
  recording: boolean
}
