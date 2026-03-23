import { ipcMain, BrowserWindow } from 'electron'
import { IPC_SYNC } from '../../shared/types/ipc-channels'
import { syncEngine } from '../services/sync-engine'
import { e2eCrypto } from '../services/crypto'
import { api as serverApi } from '../services/server-api'

export function registerSyncHandlers(): void {
  ipcMain.handle(IPC_SYNC.START, (_event, token: string) => {
    syncEngine.start(token, (status) => {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_SYNC.STATUS_CHANGED, status)
          // 同步完成后通知前端刷新数据
          if (status.state === 'idle') {
            win.webContents.send(IPC_SYNC.DATA_CHANGED)
          }
        }
      }
    })
  })

  ipcMain.handle(IPC_SYNC.STOP, () => {
    stopSync()
  })

  ipcMain.handle(IPC_SYNC.SYNC_NOW, async () => {
    await syncEngine.syncNow()
  })

  ipcMain.handle(IPC_SYNC.STATUS, () => {
    return syncEngine.getStatus()
  })

  ipcMain.handle(IPC_SYNC.SET_ENCRYPTION, async (_event, passphrase: string, salt?: string) => {
    await e2eCrypto.init()

    let actualSalt = salt
    if (!actualSalt) {
      actualSalt = e2eCrypto.generateSalt()
      const token = syncEngine.getToken()
      if (token) {
        await serverApi.post('/user/me/encryption-salt', { salt: actualSalt }, token)
      }
    }

    await e2eCrypto.deriveKey(passphrase, actualSalt)
    return { salt: actualSalt }
  })

  ipcMain.handle(IPC_SYNC.CLEAR_ENCRYPTION, () => {
    e2eCrypto.clearKey()
  })

  ipcMain.handle(IPC_SYNC.HAS_ENCRYPTION, () => {
    return e2eCrypto.hasKey()
  })

  ipcMain.handle(IPC_SYNC.SET_AUTO_INTERVAL, (_event, minutes: number) => {
    syncEngine.setAutoSyncInterval(minutes)
  })

  ipcMain.handle(IPC_SYNC.GET_SALT, async () => {
    const token = syncEngine.getToken()
    if (!token) return null
    try {
      const user = await serverApi.get<{ encryption_salt: string | null }>('/user/me', token)
      return user.encryption_salt
    } catch {
      return null
    }
  })
}

export function stopSync(): void {
  syncEngine.stop()
  e2eCrypto.clearKey()
}
