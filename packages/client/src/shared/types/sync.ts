// 同步相关共享类型（主进程和渲染进程共用）

export type SyncState = 'idle' | 'syncing' | 'error' | 'stopped'

export interface SyncStatus {
  state: SyncState
  progress?: string
  message?: string
  lastSyncAt?: string
}
