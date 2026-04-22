// SSH 密钥 IPC Handler
// 处理密钥生成、导入、部署和 SSH Agent 操作

import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { IPC_KEY } from '../../shared/types/ipc-channels'
import { keyManager } from '../services/key-manager'
import { dbRun, dbGet } from '../services/db'
import { e2eCrypto } from '../services/crypto'
import { sshSessions } from './ssh.handler'
import type { SshKey } from '../../shared/types/key'
import { logAuditEvent } from '../services/audit-service'

/** 调用 ssh-add，返回 stderr 内容 */
function runSshAdd(args: string[], stdinData?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ssh-add', args, {
      env: { ...process.env },
      stdio: stdinData !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve(out + err)
      else reject(new Error((err || out).trim() || `ssh-add exited ${code}`))
    })
    proc.on('error', (e) => reject(new Error(`ssh-add not found: ${e.message}`)))
    if (stdinData !== undefined && proc.stdin) {
      proc.stdin.write(stdinData)
      proc.stdin.end()
    }
  })
}

/** 获取当前 agent 中已加载密钥的指纹列表 */
async function getAgentFingerprints(): Promise<string[]> {
  try {
    const output = await runSshAdd(['-l'])
    return output.split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(' ')
      return parts[1] || ''
    }).filter(Boolean)
  } catch {
    return []
  }
}

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
    logAuditEvent({ eventType: 'key.import', category: 'security', summary: 'Imported SSH key: ' + name })
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
            logAuditEvent({ eventType: 'key.deploy', category: 'security', summary: 'Deployed key to ' + params.host })
            resolve()
          }
        })
      })
    })
  })

  // SSH Agent 查询：返回当前 agent 中已加载的指纹列表
  ipcMain.handle(IPC_KEY.AGENT_LIST, async () => {
    return getAgentFingerprints()
  })

  // SSH Agent 加载：将指定密钥写入临时文件后调用 ssh-add
  ipcMain.handle(IPC_KEY.AGENT_LOAD, async (_event, keyId: string) => {
    const row = dbGet<SshKeyRow>('SELECT * FROM keys WHERE id = ?', [keyId])
    if (!row) throw new Error(`Key not found: ${keyId}`)

    // 解密私钥
    let privateKey = row.private_key_enc
    if (e2eCrypto.hasKey() && privateKey) {
      try { privateKey = e2eCrypto.decrypt(privateKey) } catch { /* 已明文 */ }
    }
    if (!privateKey) throw new Error('Private key not available')

    // 写入临时文件（限制权限 600）
    const tmpFile = path.join(os.tmpdir(), `sterminal_key_${uuidv4()}`)
    try {
      fs.writeFileSync(tmpFile, privateKey, { mode: 0o600 })
      await runSshAdd([tmpFile])
      logAuditEvent({ eventType: 'key.agent_load', category: 'security', summary: `Loaded key to agent: ${row.name}` })
      return true
    } finally {
      try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
    }
  })

  // SSH Agent 卸载：通过公钥从 agent 移除
  ipcMain.handle(IPC_KEY.AGENT_UNLOAD, async (_event, keyId: string) => {
    const row = dbGet<SshKeyRow>('SELECT * FROM keys WHERE id = ?', [keyId])
    if (!row) throw new Error(`Key not found: ${keyId}`)

    // 写入临时公钥文件，让 ssh-add -d 识别
    const tmpPub = path.join(os.tmpdir(), `sterminal_pub_${uuidv4()}.pub`)
    try {
      let pubKey = row.public_key
      // 确保是 OpenSSH 格式
      if (!pubKey.startsWith('ssh-') && !pubKey.startsWith('ecdsa-')) {
        pubKey = keyManager.getOpenSshPublicKey(pubKey)
      }
      fs.writeFileSync(tmpPub, pubKey, { mode: 0o644 })
      await runSshAdd(['-d', tmpPub])
      logAuditEvent({ eventType: 'key.agent_unload', category: 'security', summary: `Unloaded key from agent: ${row.name}` })
      return true
    } finally {
      try { fs.unlinkSync(tmpPub) } catch { /* ignore */ }
    }
  })
}
