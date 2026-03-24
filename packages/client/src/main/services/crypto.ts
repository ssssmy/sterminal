// E2EE 加密模块
// 使用 libsodium (Argon2id + XSalsa20-Poly1305) 加密同步数据中的敏感字段

import sodium from 'libsodium-wrappers-sumo'

class E2ECrypto {
  private key: Uint8Array | null = null
  private ready = false

  async init(): Promise<void> {
    if (this.ready) return
    await sodium.ready
    this.ready = true
  }

  async deriveKey(passphrase: string, salt: string): Promise<void> {
    await this.init()
    const saltBytes = sodium.from_base64(salt, sodium.base64_variants.ORIGINAL)
    this.key = sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      passphrase,
      saltBytes,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    )
  }

  hasKey(): boolean {
    return this.key !== null
  }

  clearKey(): void {
    if (this.key) {
      sodium.memzero(this.key)
      this.key = null
    }
  }

  encrypt(plaintext: string): string {
    if (!this.key) throw new Error('Encryption key not set')
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(plaintext),
      nonce,
      this.key
    )
    // Concatenate nonce + ciphertext and encode as base64
    const combined = new Uint8Array(nonce.length + ciphertext.length)
    combined.set(nonce)
    combined.set(ciphertext, nonce.length)
    return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL)
  }

  decrypt(encoded: string): string {
    if (!this.key) throw new Error('Encryption key not set')
    const combined = sodium.from_base64(encoded, sodium.base64_variants.ORIGINAL)
    const nonceLen = sodium.crypto_secretbox_NONCEBYTES
    const nonce = combined.slice(0, nonceLen)
    const ciphertext = combined.slice(nonceLen)
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, this.key)
    return sodium.to_string(plaintext)
  }

  generateSalt(): string {
    if (!this.ready) throw new Error('Sodium not initialized')
    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
    return sodium.to_base64(salt, sodium.base64_variants.ORIGINAL)
  }
}

export const e2eCrypto = new E2ECrypto()
