// SSH 密钥 IPC Handler
// 处理密钥生成、导入、部署和 SSH Agent 操作

import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_KEY } from '../../shared/types/ipc-channels'
import { keyManager } from '../services/key-manager'
import { dbRun, dbGet } from '../services/db'
import { e2eCrypto } from '../services/crypto'
import { sshSessions } from './ssh.handler'
import type { SshKey } from '../../shared/types/key'
import { logAuditEvent } from '../services/audit-service'

interface SshKeyRow {
  id: string
  name: string
  key_type: string
  bits: number | null
  curve: string | null
  fingerprint: string
  public_key: string
  private_key_enc: string
  passphrase_enc: string | null
  comment: string | null
  auto_load_agent: number
  created_at: string
}

function mapRow(row: SshKeyRow): SshKey {
  return {
    id: row.id,
    name: row.name,
    keyType: row.key_type as SshKey['keyType'],
    bits: row.bits ?? undefined,
    curve: row.curve ?? undefined,
    fingerprint: row.fingerprint,
    publicKey: row.public_key,
    privateKeyEnc: row.private_key_enc,
    passphraseEnc: row.passphrase_enc ?? undefined,
    comment: row.comment ?? undefined,
    autoLoadAgent: row.auto_load_agent === 1,
    createdAt: row.created_at,
  }
}

export function registerKeyHandlers(): void {
  // 生成新密钥对
  ipcMain.handle(IPC_KEY.GENERATE, async (_event, params: {
    name: string
    keyType: 'ed25519' | 'rsa' | 'ecdsa'
    bits?: number
    curve?: string
    passphrase?: string
    comment?: string
  }) => {
    const keyInfo = keyManager.generateKey(params)

    const id = uuidv4()
    const now = new Date().toISOString()

    // E2EE 加密私钥（有密钥时加密，无密钥时明文）
    const privateKeyEnc = e2eCrypto.hasKey() ? e2eCrypto.encrypt(keyInfo.privateKey) : keyInfo.privateKey
    const passphraseEnc = params.passphrase && e2eCrypto.hasKey() ? e2eCrypto.encrypt(params.passphrase) : (params.passphrase ?? null)

    dbRun(
      `INSERT INTO keys (id, name, key_type, bits, curve, fingerprint, public_key, private_key_enc, passphrase_enc, comment, auto_load_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        params.name,
        keyInfo.keyType,
        keyInfo.bits ?? null,
        keyInfo.curve ?? null,
        keyInfo.fingerprint,
        keyInfo.publicKey,
        privateKeyEnc,
        passphraseEnc,
        params.comment ?? null,
      ]
    )

    const row = dbGet<SshKeyRow>('SELECT * FROM keys WHERE id = ?', [id])
    if (!row) throw new Error('Failed to retrieve generated key')
    logAuditEvent({ eventType: 'key.generate', category: 'security', summary: 'Generated SSH key: ' + params.name })
    return mapRow(row)
  })

  // 导入已有私钥
  ipcMain.handle(IPC_KEY.IMPORT, async (_event, params: {
    fileContent: string
    name?: string
    passphrase?: string
  }) => {
    const keyInfo = keyManager.importKey(params.fileContent, params.passphrase)

    const id = uuidv4()
    const now = new Date().toISOString()
    const name = params.name || `Imported ${keyInfo.keyType.toUpperCase()} Key`

    const privateKeyEnc = e2eCrypto.hasKey() ? e2eCrypto.encrypt(keyInfo.privateKey) : keyInfo.privateKey

    dbRun(
      `INSERT INTO keys (id, name, key_type, bits, curve, fingerprint, public_key, private_key_enc, comment, auto_load_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        name,
        keyInfo.keyType,
        keyInfo.bits ?? null,
        keyInfo.curve ?? null,
        keyInfo.fingerprint,
        keyInfo.publicKey,
        privateKeyEnc,
        keyInfo.comment ?? null,
      ]
    )

    const row = dbGet<SshKeyRow>('SELECT * FROM keys WHERE id = ?', [id])
    if (!row) throw new Error('Failed to retrieve imported key')
    return mapRow(row)
  })

  // 部署公钥到远程主机（复用已有的 SSH 会话）
  ipcMain.handle(IPC_KEY.DEPLOY, async (_event, params: {
    keyId: string
    hostId?: string
    host: string
    port: number
    username: string
    password?: string
  }) => {
    const row = dbGet<SshKeyRow>('SELECT * FROM keys WHERE id = ?', [params.keyId])
    if (!row) throw new Error(`Key not found: ${params.keyId}`)

    const openSshPubKey = keyManager.getOpenSshPublicKey(row.public_key)
    const escapedKey = openSshPubKey.replace(/'/g, "'\\''")
    const command = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${escapedKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`

    // 查找该主机的活跃 SSH 会话
    let client: import('ssh2').Client | null = null
    for (const [, session] of sshSessions) {
      if (session.hostId === params.hostId || (session.client && params.host)) {
        // 匹配 hostId 或地址
        client = session.client
        break
      }
    }

    if (!client) {
      throw new Error('请先连接该主机的 SSH 终端，再部署密钥')
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Deploy command timeout (30s)')), 30000)

      client!.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          return reject(err)
        }
        let stderr = ''
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
        stream.on('close', (code: number) => {
          clearTimeout(timer)
          if (code !== 0) {
            reject(new Error(`Exit ${code}: ${stderr.trim()}`))
          } else {
            resolve()
          }
        })
      })
    })
  })

  // SSH Agent 加载（存根）
  ipcMain.handle(IPC_KEY.AGENT_LOAD, (_event, _keyId: string) => {
    return true
  })

  // SSH Agent 卸载（存根）
  ipcMain.handle(IPC_KEY.AGENT_UNLOAD, (_event, _keyId: string) => {
    return true
  })
}
