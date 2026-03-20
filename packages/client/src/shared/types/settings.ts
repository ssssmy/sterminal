// 设置相关类型定义

// 设置 KV 存储类型
export type SettingsKey = string
export type SettingsValue = string | number | boolean

// 应用主题类型
export type AppTheme = 'light' | 'dark' | 'system'

// 光标样式类型
export type CursorStyle = 'block' | 'underline' | 'bar'

// SFTP 面板位置
export type SftpPanelPosition = 'sidebar' | 'bottom' | 'tab'

// SFTP 冲突策略
export type SftpConflictStrategy = 'overwrite' | 'skip' | 'rename' | 'ask'

// 更新检查频率
export type UpdateCheckFrequency = 'startup' | 'daily' | 'weekly' | 'never'
