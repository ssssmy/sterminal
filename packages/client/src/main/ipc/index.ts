// IPC Handler 统一注册入口
// 在主进程启动时调用 registerAllHandlers() 注册所有 IPC 处理器

import { registerDbHandlers } from './db.handler'
import { registerPtyHandlers } from './pty.handler'
import { registerSshHandlers } from './ssh.handler'
import { registerSystemHandlers } from './system.handler'
import { registerLogHandlers } from './log.handler'
import { registerPortForwardHandlers } from './port-forward.handler'
import { registerSftpHandlers } from './sftp.handler'
import { registerLocalFsHandlers } from './local-fs.handler'
import { registerSyncHandlers } from './sync.handler'
import { registerServerUrlHandlers } from '../services/server-url-service'
import { registerKeyHandlers } from './key.handler'
import { registerVaultHandlers } from './vault.handler'

/**
 * 注册所有 IPC handlers
 * 需在 BrowserWindow 创建之前调用
 */
export function registerAllHandlers(): void {
  registerDbHandlers()
  registerPtyHandlers()
  registerSshHandlers()
  registerSystemHandlers()
  registerLogHandlers()
  registerPortForwardHandlers()
  registerSftpHandlers()
  registerLocalFsHandlers()
  registerSyncHandlers()
  registerServerUrlHandlers()
  registerKeyHandlers()
  registerVaultHandlers()
  console.log('[IPC] 所有 handlers 注册完成')
}
