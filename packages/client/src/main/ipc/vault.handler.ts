import { ipcMain } from 'electron'
import { IPC_VAULT } from '../../shared/types/ipc-channels'
import { vaultService } from '../services/vault-service'
import type { PasswordGeneratorOptions } from '../../shared/types/vault'

export function registerVaultHandlers(): void {
  // 密码生成器
  ipcMain.handle(IPC_VAULT.GENERATE_PASSWORD, async (_event, options: PasswordGeneratorOptions) => {
    await vaultService.init()
    return vaultService.generatePassword(options)
  })

  // Vault 始终可用（无主密码模式）
  ipcMain.handle(IPC_VAULT.IS_SETUP, () => true)
  ipcMain.handle(IPC_VAULT.SETUP, () => {})
  ipcMain.handle(IPC_VAULT.UNLOCK, () => {})
  ipcMain.handle(IPC_VAULT.LOCK, () => {})
}
