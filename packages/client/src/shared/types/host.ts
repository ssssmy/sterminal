// 主机配置相关类型定义

export interface Host {
  id: string
  label?: string
  address: string
  port: number
  protocol: 'ssh' | 'mosh' | 'telnet'
  username?: string
  authType: 'password' | 'key' | 'password_key' | 'agent' | 'keyboard'
  password?: string           // 解密后的明文（仅内存）
  keyId?: string
  keyPassphrase?: string
  startupCommand?: string
  environment?: Record<string, string>
  encoding: string
  keepaliveInterval: number
  connectTimeout: number
  heartbeatTimeout: number
  compression: boolean
  strictHostKey: boolean
  sshVersion: 'auto' | '2'
  preferredKex?: string
  preferredCipher?: string
  preferredMac?: string
  preferredHostKeyAlgo?: string
  proxyJumpId?: string
  proxyCommand?: string
  socksProxy?: string
  httpProxy?: string
  proxyUsername?: string
  proxyPassword?: string
  terminalTheme?: string
  fontFamily?: string
  fontSize?: number
  cursorStyle?: 'block' | 'underline' | 'bar'
  cursorBlink?: boolean
  notes?: string
  groupId?: string
  sortOrder: number
  tagIds: string[]
  lastConnected?: string
  connectCount: number
}

export interface HostGroup {
  id: string
  name: string
  parentId?: string
  icon?: string
  color?: string
  sortOrder: number
  collapsed: boolean
}

export interface Tag {
  id: string
  name: string
  color: string
}
