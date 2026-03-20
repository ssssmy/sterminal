// IPC Handler 统一注册入口
// 在主进程启动时调用 registerAllHandlers() 注册所有 IPC 处理器

import { registerDbHandlers } from './db.handler'
import { registerPtyHandlers } from './pty.handler'
import { registerSshHandlers } from './ssh.handler'
import { registerSystemHandlers } from './system.handler'

/**
 * 注册所有 IPC handlers
 * 需在 BrowserWindow 创建之前调用
 */
export function registerAllHandlers(): void {
  registerDbHandlers()
  registerPtyHandlers()
  registerSshHandlers()
  registerSystemHandlers()
  console.log('[IPC] 所有 handlers 注册完成')
}
