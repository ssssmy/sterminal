// Vault IPC Handler
// 处理主密码设置、解锁/锁定、密码生成等操作

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_VAULT } from '../../shared/types/ipc-channels'
import { vaultService } from '../services/vault-service'
import type { PasswordGeneratorOptions } from '../../shared/types/vault'

function notifyLocked(): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_VAULT.LOCK)
    }
  }
}

export function registerVaultHandlers(): void {
  // 首次设置主密码
  ipcMain.handle(IPC_VAULT.SETUP, async (_event, masterPassword: string) => {
    await vaultService.setup(masterPassword)
    vaultService.setOnLockCallback(notifyLocked)
  })

  // 解锁 Vault
  ipcMain.handle(IPC_VAULT.UNLOCK, async (_event, masterPassword: string) => {
    await vaultService.unlock(masterPassword)
    vaultService.setOnLockCallback(notifyLocked)
    return {
      isSetup: vaultService.isSetup(),
      isLocked: !vaultService.isUnlocked(),
      lockTimeout: vaultService.getLockTimeout(),
    }
  })

  // 锁定 Vault
  ipcMain.handle(IPC_VAULT.LOCK, () => {
    vaultService.lock()
  })

  // 生成随机密码
  ipcMain.handle(IPC_VAULT.GENERATE_PASSWORD, (_event, options: PasswordGeneratorOptions) => {
    return vaultService.generatePassword(options)
  })

  // 查询 Vault 是否已设置
  ipcMain.handle(IPC_VAULT.IS_SETUP, () => {
    return vaultService.isSetup()
  })
}
