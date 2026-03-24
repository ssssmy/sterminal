// Vault 加密服务
// 使用 libsodium (Argon2id + XSalsa20-Poly1305) 实现主密码保护的密钥库

import sodium from 'libsodium-wrappers-sumo'
import { dbGet, dbRun } from './db'
import type { PasswordGeneratorOptions } from '../../shared/types/vault'

interface VaultConfigRow {
  id: number
  master_hash: string | null
  salt: string | null
  lock_timeout: number
}

export class VaultService {
  private key: Uint8Array | null = null
  private lockTimer: ReturnType<typeof setTimeout> | null = null
  private onLockCallback: (() => void) | null = null
  private sodiumReady = false

  // ===== 初始化 =====

  async init(): Promise<void> {
    if (this.sodiumReady) return
    await sodium.ready
    this.sodiumReady = true
  }

  // ===== 首次设置 =====

  async setup(masterPassword: string): Promise<void> {
    await this.init()

    // 生成随机 salt
    const saltBytes = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
    const salt = sodium.to_base64(saltBytes, sodium.base64_variants.ORIGINAL)

    // 存储 Argon2id 密码哈希（用于后续验证）
    const masterHash = sodium.crypto_pwhash_str(
      masterPassword,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE
    )

    // 派生加密密钥并保留在内存中
    const derivedKey = sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      masterPassword,
      saltBytes,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    )

    // 持久化到 vault_config（upsert id=1）
    dbRun(
      `INSERT INTO vault_config (id, master_hash, salt, lock_timeout)
       VALUES (1, ?, ?, 900)
       ON CONFLICT(id) DO UPDATE SET master_hash = excluded.master_hash, salt = excluded.salt`,
      [masterHash, salt]
    )

    // 持有派生密钥
    this.key = derivedKey
    this.resetAutoLockTimer()
  }

  // ===== 解锁 =====

  async unlock(masterPassword: string): Promise<void> {
    await this.init()

    const row = dbGet<VaultConfigRow>('SELECT * FROM vault_config WHERE id = 1')
    if (!row || !row.master_hash || !row.salt) {
      throw new Error('Vault not set up')
    }

    // 验证密码
    const valid = sodium.crypto_pwhash_str_verify(row.master_hash, masterPassword)
    if (!valid) {
      throw new Error('Invalid master password')
    }

    // 派生加密密钥
    const saltBytes = sodium.from_base64(row.salt, sodium.base64_variants.ORIGINAL)
    const derivedKey = sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      masterPassword,
      saltBytes,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    )

    this.key = derivedKey
    this.resetAutoLockTimer()
  }

  // ===== 锁定 =====

  lock(): void {
    if (this.key) {
      sodium.memzero(this.key)
      this.key = null
    }
    this._clearTimer()
  }

  // ===== 状态查询 =====

  isSetup(): boolean {
    const row = dbGet<VaultConfigRow>('SELECT id FROM vault_config WHERE id = 1')
    return row !== undefined
  }

  isUnlocked(): boolean {
    return this.key !== null
  }

  // ===== 加密 / 解密 =====

  encrypt(plaintext: string): string {
    if (!this.key) throw new Error('Vault is locked')
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(plaintext),
      nonce,
      this.key
    )
    const combined = new Uint8Array(nonce.length + ciphertext.length)
    combined.set(nonce)
    combined.set(ciphertext, nonce.length)
    this.resetAutoLockTimer()
    return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL)
  }

  decrypt(encoded: string): string {
    if (!this.key) throw new Error('Vault is locked')
    const combined = sodium.from_base64(encoded, sodium.base64_variants.ORIGINAL)
    const nonceLen = sodium.crypto_secretbox_NONCEBYTES
    const nonce = combined.slice(0, nonceLen)
    const ciphertext = combined.slice(nonceLen)
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, this.key)
    this.resetAutoLockTimer()
    return sodium.to_string(plaintext)
  }

  // ===== 密码生成 =====

  generatePassword(options: PasswordGeneratorOptions): string {
    const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const UPPERCASE_UNAMBIGUOUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
    const LOWERCASE_UNAMBIGUOUS = 'abcdefghjkmnpqrstuvwxyz'
    const NUMBERS = '0123456789'
    const NUMBERS_UNAMBIGUOUS = '23456789'
    const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?'
    const SYMBOLS_UNAMBIGUOUS = '!@#$%^&*_+-=|;:,.<>?'

    let charset = ''
    if (options.uppercase) {
      charset += options.excludeAmbiguous ? UPPERCASE_UNAMBIGUOUS : UPPERCASE
    }
    if (options.lowercase) {
      charset += options.excludeAmbiguous ? LOWERCASE_UNAMBIGUOUS : LOWERCASE
    }
    if (options.numbers) {
      charset += options.excludeAmbiguous ? NUMBERS_UNAMBIGUOUS : NUMBERS
    }
    if (options.symbols) {
      charset += options.excludeAmbiguous ? SYMBOLS_UNAMBIGUOUS : SYMBOLS
    }

    if (charset.length === 0) {
      throw new Error('At least one character set must be selected')
    }

    const randomBytes = sodium.randombytes_buf(options.length)
    let result = ''
    for (let i = 0; i < options.length; i++) {
      result += charset[randomBytes[i] % charset.length]
    }
    return result
  }

  // ===== 自动锁定超时 =====

  async setLockTimeout(seconds: number): Promise<void> {
    dbRun(
      `INSERT INTO vault_config (id, lock_timeout)
       VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET lock_timeout = excluded.lock_timeout`,
      [seconds]
    )
    this.resetAutoLockTimer()
  }

  getLockTimeout(): number {
    const row = dbGet<VaultConfigRow>('SELECT lock_timeout FROM vault_config WHERE id = 1')
    return row?.lock_timeout ?? 900
  }

  resetAutoLockTimer(): void {
    this._clearTimer()
    const timeout = this.getLockTimeout()
    if (timeout <= 0) return
    this.lockTimer = setTimeout(() => {
      this.lock()
      this.onLockCallback?.()
    }, timeout * 1000)
  }

  setOnLockCallback(cb: () => void): void {
    this.onLockCallback = cb
  }

  // ===== 私有工具 =====

  private _clearTimer(): void {
    if (this.lockTimer !== null) {
      clearTimeout(this.lockTimer)
      this.lockTimer = null
    }
  }
}

export const vaultService = new VaultService()
