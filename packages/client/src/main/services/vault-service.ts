// Vault 服务（无主密码模式）
// 条目明文存储在本地 DB，通过 E2EE 云同步保护传输安全

import sodium from 'libsodium-wrappers-sumo'
import type { PasswordGeneratorOptions } from '../../shared/types/vault'

class VaultService {
  private sodiumReady = false

  async init(): Promise<void> {
    if (this.sodiumReady) return
    await sodium.ready
    this.sodiumReady = true
  }

  // Vault 始终可用，无需设置/解锁
  isSetup(): boolean { return true }
  isUnlocked(): boolean { return true }
  lock(): void { /* no-op */ }
  setOnLockCallback(_cb: () => void): void { /* no-op */ }

  generatePassword(options: PasswordGeneratorOptions): string {
    if (!this.sodiumReady) throw new Error('Sodium not initialized')

    const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const UPPER_SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const LOWER = 'abcdefghijklmnopqrstuvwxyz'
    const LOWER_SAFE = 'abcdefghjkmnpqrstuvwxyz'
    const NUMS = '0123456789'
    const NUMS_SAFE = '23456789'
    const SYMS = '!@#$%^&*()_+-=[]{}|;:,.<>?'
    const SYMS_SAFE = '!@#$%^&*_+-=|;:,.<>?'

    let charset = ''
    if (options.uppercase) charset += options.excludeAmbiguous ? UPPER_SAFE : UPPER
    if (options.lowercase) charset += options.excludeAmbiguous ? LOWER_SAFE : LOWER
    if (options.numbers) charset += options.excludeAmbiguous ? NUMS_SAFE : NUMS
    if (options.symbols) charset += options.excludeAmbiguous ? SYMS_SAFE : SYMS

    if (!charset) throw new Error('At least one character set must be selected')

    const bytes = sodium.randombytes_buf(options.length)
    let result = ''
    for (let i = 0; i < options.length; i++) {
      result += charset[bytes[i] % charset.length]
    }
    return result
  }
}

export const vaultService = new VaultService()
