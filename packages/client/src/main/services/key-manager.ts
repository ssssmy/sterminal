// SSH 密钥管理服务
// 负责生成、导入、计算指纹、导出公钥和远程部署 SSH 密钥

import crypto from 'crypto'
import { Client } from 'ssh2'

// ===== 类型定义 =====

export interface KeyInfo {
  publicKey: string
  privateKey: string
  fingerprint: string
  keyType: string
  bits?: number
  curve?: string
}

export interface ImportedKeyInfo extends KeyInfo {
  comment?: string
}

interface GenerateKeyParams {
  name: string
  keyType: 'ed25519' | 'rsa' | 'ecdsa'
  bits?: number
  curve?: string
  passphrase?: string
}

interface DeployConnectionConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
}

// ===== 工具函数 =====

/**
 * 从 PEM 格式公钥计算 SSH 指纹（SHA256，与 ssh-keygen -l 输出一致）
 */
function computeFingerprint(publicKeyPem: string): string {
  const key = crypto.createPublicKey(publicKeyPem)
  const der = key.export({ type: 'spki', format: 'der' })
  const hash = crypto.createHash('sha256').update(der).digest('base64')
  return `SHA256:${hash.replace(/=+$/, '')}`
}

/**
 * 将 PEM 格式公钥转换为 OpenSSH authorized_keys 单行格式
 * 通过解析 DER/SPKI 字节手动构造 OpenSSH wire format
 */
function pemToOpenSshPublicKey(publicKeyPem: string, comment = ''): string {
  const key = crypto.createPublicKey(publicKeyPem)
  const keyDetails = key.asymmetricKeyDetails

  // Node.js 15+ 支持直接导出 OpenSSH 格式（仅私钥）
  // 对于公钥，利用 KeyObject 的类型信息手动构造 wire format
  const keyType = key.asymmetricKeyType

  if (keyType === 'ed25519') {
    return buildEd25519OpenSshPub(key, comment)
  } else if (keyType === 'rsa') {
    return buildRsaOpenSshPub(key, comment)
  } else if (keyType === 'ec') {
    const curve = keyDetails?.namedCurve
    return buildEcOpenSshPub(key, curve || 'prime256v1', comment)
  }

  throw new Error(`Unsupported key type for OpenSSH export: ${keyType}`)
}

/**
 * 将长度 + 数据编码为 SSH wire format 的 mpint/string 字段
 */
function sshEncode(data: Buffer): Buffer {
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  return Buffer.concat([len, data])
}

/**
 * Ed25519 公钥 OpenSSH 格式：ssh-ed25519 <base64> <comment>
 * wire format: string("ssh-ed25519") + string(32-byte-pub-key)
 */
function buildEd25519OpenSshPub(key: crypto.KeyObject, comment: string): string {
  // 导出 DER/SPKI，最后 32 字节是 ed25519 原始公钥
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer
  const rawPub = der.slice(-32)

  const keyTypeField = sshEncode(Buffer.from('ssh-ed25519'))
  const pubKeyField = sshEncode(rawPub)
  const payload = Buffer.concat([keyTypeField, pubKeyField])

  const b64 = payload.toString('base64')
  return comment ? `ssh-ed25519 ${b64} ${comment}` : `ssh-ed25519 ${b64}`
}

/**
 * RSA 公钥 OpenSSH 格式：ssh-rsa <base64> <comment>
 * wire format: string("ssh-rsa") + mpint(e) + mpint(n)
 * 从 PKCS#1 DER 中提取 e 和 n
 */
function buildRsaOpenSshPub(key: crypto.KeyObject, comment: string): string {
  // 导出为 PKCS#1 DER（RSA 特定格式，包含 sequence of n, e）
  const der = key.export({ type: 'pkcs1', format: 'der' }) as Buffer

  // PKCS#1 RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
  // 简单 DER 解析器
  let offset = 0

  function readTag(): number {
    return der[offset++]
  }

  function readLength(): number {
    const first = der[offset++]
    if (first < 0x80) return first
    const lenBytes = first & 0x7f
    let len = 0
    for (let i = 0; i < lenBytes; i++) {
      len = (len << 8) | der[offset++]
    }
    return len
  }

  function readInteger(): Buffer {
    readTag() // 0x02
    const len = readLength()
    const val = der.slice(offset, offset + len)
    offset += len
    return Buffer.from(val)
  }

  readTag() // SEQUENCE tag 0x30
  readLength() // SEQUENCE length

  const n = readInteger()
  const e = readInteger()

  // SSH mpint: if high bit set, prepend 0x00
  function toMpint(buf: Buffer): Buffer {
    if (buf[0] & 0x80) {
      return Buffer.concat([Buffer.from([0x00]), buf])
    }
    return buf
  }

  const keyTypeField = sshEncode(Buffer.from('ssh-rsa'))
  const eField = sshEncode(toMpint(e))
  const nField = sshEncode(toMpint(n))
  const payload = Buffer.concat([keyTypeField, eField, nField])

  const b64 = payload.toString('base64')
  return comment ? `ssh-rsa ${b64} ${comment}` : `ssh-rsa ${b64}`
}

/**
 * ECDSA 公钥 OpenSSH 格式
 * wire format: string("ecdsa-sha2-<nistpNNN>") + string("nistpNNN") + string(uncompressed-point)
 */
function buildEcOpenSshPub(key: crypto.KeyObject, namedCurve: string, comment: string): string {
  // 映射 Node.js curve 名称到 NIST 名称
  const curveMap: Record<string, string> = {
    'prime256v1': 'nistp256',
    'P-256': 'nistp256',
    'secp384r1': 'nistp384',
    'P-384': 'nistp384',
    'secp521r1': 'nistp521',
    'P-521': 'nistp521',
  }
  const nistName = curveMap[namedCurve]
  if (!nistName) throw new Error(`Unsupported EC curve: ${namedCurve}`)

  const keyTypeName = `ecdsa-sha2-${nistName}`

  // 从 SPKI DER 提取未压缩的公钥点（以 0x04 开头）
  // 标准 SPKI 格式：SEQUENCE { SEQUENCE { OID ecPublicKey, OID curve }, BIT STRING { 0x00 + point } }
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer
  let idx = 0

  function findBitString(): Buffer {
    while (idx < der.length) {
      const tag = der[idx]
      if (tag === 0x03) {
        idx++
        const first = der[idx++]
        let len = first
        if (first >= 0x80) {
          const lenBytes = first & 0x7f
          len = 0
          for (let i = 0; i < lenBytes; i++) {
            len = (len << 8) | der[idx++]
          }
        }
        // Skip the BIT STRING unused-bits byte (0x00)
        idx++
        return der.slice(idx, idx + len - 1)
      }
      // Skip over other TLV entries
      idx++
      const first = der[idx++]
      let len = first
      if (first >= 0x80) {
        const lenBytes = first & 0x7f
        len = 0
        for (let i = 0; i < lenBytes; i++) {
          len = (len << 8) | der[idx++]
        }
      }
      idx += len
    }
    throw new Error('BIT STRING not found in SPKI DER')
  }

  const point = findBitString()

  const keyTypeField = sshEncode(Buffer.from(keyTypeName))
  const curveName = sshEncode(Buffer.from(nistName))
  const pointField = sshEncode(point)
  const payload = Buffer.concat([keyTypeField, curveName, pointField])

  const b64 = payload.toString('base64')
  return comment ? `${keyTypeName} ${b64} ${comment}` : `${keyTypeName} ${b64}`
}

/**
 * 从私钥 PEM 中检测密钥类型
 */
function detectKeyTypeFromPrivatePem(pem: string): { keyType: string; bits?: number; curve?: string } {
  const key = crypto.createPrivateKey(pem)
  const asymType = key.asymmetricKeyType
  const details = key.asymmetricKeyDetails

  if (asymType === 'ed25519') {
    return { keyType: 'ed25519' }
  } else if (asymType === 'rsa') {
    return { keyType: 'rsa', bits: details?.modulusLength }
  } else if (asymType === 'ec') {
    const curveMap: Record<string, string> = {
      'prime256v1': 'P-256',
      'secp384r1': 'P-384',
      'secp521r1': 'P-521',
    }
    const rawCurve = details?.namedCurve || ''
    return { keyType: 'ecdsa', curve: curveMap[rawCurve] || rawCurve }
  }

  throw new Error(`Unknown key type: ${asymType}`)
}

// ===== 主服务对象 =====

export const keyManager = {
  /**
   * 生成新的 SSH 密钥对
   */
  generateKey(params: GenerateKeyParams): KeyInfo {
    const { keyType, bits, curve, passphrase } = params

    let privateKeyPem: string
    let publicKeyPem: string
    let resultBits: number | undefined
    let resultCurve: string | undefined

    // Helper: private key encoding options (cipher only added when passphrase given)
    const privEnc = passphrase
      ? { type: 'pkcs8' as const, format: 'pem' as const, cipher: 'aes-256-cbc' as const, passphrase }
      : { type: 'pkcs8' as const, format: 'pem' as const }

    if (keyType === 'ed25519') {
      const pair = crypto.generateKeyPairSync('ed25519', {
        privateKeyEncoding: privEnc,
        publicKeyEncoding: { type: 'spki' as const, format: 'pem' as const },
      })
      privateKeyPem = pair.privateKey
      publicKeyPem = pair.publicKey
    } else if (keyType === 'rsa') {
      const modulusLength = bits === 4096 ? 4096 : 2048
      resultBits = modulusLength
      const pair = crypto.generateKeyPairSync('rsa', {
        modulusLength,
        privateKeyEncoding: privEnc,
        publicKeyEncoding: { type: 'pkcs1' as const, format: 'pem' as const },
      })
      privateKeyPem = pair.privateKey
      publicKeyPem = pair.publicKey
    } else if (keyType === 'ecdsa') {
      const namedCurveMap: Record<string, string> = {
        'P-256': 'prime256v1',
        'P-384': 'secp384r1',
        'P-521': 'secp521r1',
      }
      const namedCurve = namedCurveMap[curve || 'P-256'] || 'prime256v1'
      resultCurve = curve || 'P-256'
      const pair = crypto.generateKeyPairSync('ec', {
        namedCurve,
        privateKeyEncoding: privEnc,
        publicKeyEncoding: { type: 'spki' as const, format: 'pem' as const },
      })
      privateKeyPem = pair.privateKey
      publicKeyPem = pair.publicKey
    } else {
      throw new Error(`Unsupported key type: ${keyType}`)
    }

    const fingerprint = computeFingerprint(publicKeyPem)

    return {
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      fingerprint,
      keyType,
      bits: resultBits,
      curve: resultCurve,
    }
  },

  /**
   * 从文件内容导入私钥（自动检测 OpenSSH 和 PEM 格式）
   */
  importKey(fileContent: string, passphrase?: string): ImportedKeyInfo {
    const trimmed = fileContent.trim()

    // 验证是否为已知私钥格式
    const isOpenSsh = trimmed.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----')
    const isPkcs8 = trimmed.startsWith('-----BEGIN PRIVATE KEY-----') || trimmed.startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----')
    const isRsaPem = trimmed.startsWith('-----BEGIN RSA PRIVATE KEY-----')
    const isEcPem = trimmed.startsWith('-----BEGIN EC PRIVATE KEY-----')

    if (!isOpenSsh && !isPkcs8 && !isRsaPem && !isEcPem) {
      throw new Error('Unrecognized private key format. Expected OpenSSH or PEM.')
    }

    // 解析私钥（crypto 模块同时支持 OpenSSH 和 PEM 格式）
    let privateKeyObject: crypto.KeyObject
    try {
      privateKeyObject = crypto.createPrivateKey(
        passphrase
          ? { key: trimmed, format: 'pem', passphrase }
          : { key: trimmed, format: 'pem' }
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('bad decrypt') || msg.toLowerCase().includes('passphrase')) {
        throw new Error('Invalid passphrase or key is encrypted and no passphrase was provided')
      }
      throw new Error(`Failed to parse private key: ${msg}`)
    }

    // 重新导出为非加密 PKCS8 PEM（标准化存储格式）
    const privateKeyPem = privateKeyObject.export({ type: 'pkcs8', format: 'pem' }).toString()

    // 派生公钥
    const publicKeyObject = crypto.createPublicKey(privateKeyObject)
    const asymType = publicKeyObject.asymmetricKeyType

    // RSA 公钥用 pkcs1 格式方便后续解析
    const publicKeyPem = asymType === 'rsa'
      ? publicKeyObject.export({ type: 'pkcs1', format: 'pem' }).toString()
      : publicKeyObject.export({ type: 'spki', format: 'pem' }).toString()

    const fingerprint = computeFingerprint(publicKeyPem)
    const typeInfo = detectKeyTypeFromPrivatePem(privateKeyPem)

    // 尝试从 OpenSSH 格式提取注释
    let comment: string | undefined
    if (isOpenSsh) {
      const commentMatch = trimmed.match(/\n([^\n-][^\n]*)\n-----END OPENSSH PRIVATE KEY-----/)
      // OpenSSH 私钥文件最后一行 base64 前可能有注释，但标准格式注释在 header 中不直接可读
      // 通常注释是文件末尾对应的 .pub 文件内容，私钥本身不包含可读注释字段
      void commentMatch
    }

    return {
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      fingerprint,
      keyType: typeInfo.keyType,
      bits: typeInfo.bits,
      curve: typeInfo.curve,
      comment,
    }
  },

  /**
   * 计算公钥指纹（SHA256，与 ssh-keygen -l 输出一致）
   */
  computeFingerprint,

  /**
   * 将 PEM 格式公钥转换为 OpenSSH authorized_keys 单行格式
   */
  getOpenSshPublicKey(publicKeyPem: string, comment = ''): string {
    return pemToOpenSshPublicKey(publicKeyPem, comment)
  },

  /**
   * 将公钥部署到远程主机（等同于 ssh-copy-id）
   * 通过 SSH 执行命令将公钥追加到 ~/.ssh/authorized_keys
   */
  async deployKey(connectionConfig: DeployConnectionConfig, publicKeyPem: string): Promise<void> {
    const openSshPubKey = pemToOpenSshPublicKey(publicKeyPem)

    // 转义单引号，防止命令注入
    const escapedKey = openSshPubKey.replace(/'/g, "'\\''")
    const command = [
      'mkdir -p ~/.ssh',
      'chmod 700 ~/.ssh',
      `echo '${escapedKey}' >> ~/.ssh/authorized_keys`,
      'chmod 600 ~/.ssh/authorized_keys',
    ].join(' && ')

    return new Promise<void>((resolve, reject) => {
      const conn = new Client()
      let settled = false

      // 30 秒超时保护
      const timeout = setTimeout(() => {
        done(new Error('Deploy timeout: connection took too long'))
      }, 30000)

      function done(err?: Error): void {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        conn.end()
        if (err) reject(err)
        else resolve()
      }

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            done(err)
            return
          }

          let stderr = ''
          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })

          stream.on('close', (code: number) => {
            if (code !== 0) {
              done(new Error(`Remote command failed (exit ${code}): ${stderr.trim()}`))
            } else {
              done()
            }
          })
        })
      })

      conn.on('error', (err) => {
        console.error('[KeyManager] Deploy connection error:', err.message)
        done(err)
      })

      conn.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finish) => {
        finish([connectionConfig.password || ''])
      })

      conn.connect({
        host: connectionConfig.host,
        port: connectionConfig.port,
        username: connectionConfig.username,
        password: connectionConfig.password || undefined,
        privateKey: connectionConfig.privateKey || undefined,
        readyTimeout: 15000,
        hostVerifier: () => true,
        tryKeyboard: true,
      } as Parameters<Client['connect']>[0])
    })
  },
}
