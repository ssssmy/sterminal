export interface SftpFileInfo {
  name: string
  path: string           // 完整路径
  size: number
  modifiedTime: string   // ISO 日期
  permissions: string    // rwxrwxrwx 格式
  mode: number           // 八进制权限数字
  isDirectory: boolean
  isSymlink: boolean
  owner: number          // uid
  group: number          // gid
  target?: string        // 符号链接目标
}

export interface SftpTabState {
  sftpId: string
  remoteCwd: string
  localCwd: string
  remoteFiles: SftpFileInfo[]
  localFiles: SftpFileInfo[]
  loading: boolean
  remoteLoading: boolean
  localLoading: boolean
  showHidden: boolean
  viewMode: 'list' | 'grid'
  error?: string
}

export interface SftpTransferItem {
  transferId: string
  sftpId: string
  direction: 'upload' | 'download'
  localPath: string
  remotePath: string
  fileName: string
  totalBytes: number
  transferredBytes: number
  status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled'
  error?: string
  speed: number
}
