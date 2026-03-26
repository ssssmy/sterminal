// SSH IPC Handler
// 使用 ssh2 库管理 SSH 连接生命周期

import { ipcMain, BrowserWindow, WebContents } from 'electron'
import crypto from 'crypto'
import { Client, ClientChannel } from 'ssh2'
import { IPC_SSH } from '../../shared/types/ipc-channels'
import type { Host } from '../../shared/types/host'
import { recordData, shouldAutoRecord, startRecording } from '../services/session-recorder'
import { dbGet, dbRun, dbAll } from '../services/db'
import { v4 as uuidv4 } from 'uuid'
import { e2eCrypto } from '../services/crypto'

// 待用户确认的主机密钥请求
const pendingHostVerify = new Map<string, { resolve: (accept: boolean) => void }>()

export interface SshSession {
  client: Client
  stream: ClientChannel | null
  webContents: WebContents
  hostId: string
  keepaliveInterval?: number
}

export const sshSessions = new Map<string, SshSession>()

// Health probe state
const healthProbes: Map<string, NodeJS.Timeout> = new Map()

// Start health probe for a connection
function startHealthProbe(connectionId: string): void {
  // Don't start if already running
  if (healthProbes.has(connectionId)) return

  const session = sshSessions.get(connectionId)
  if (!session?.client) return

  // Get probe interval from host config (use keepaliveInterval, min 10s)
  const interval = Math.max(10000, (session.keepaliveInterval || 60) * 1000)

  const timer = setInterval(() => {
    probeLatency(connectionId)
  }, interval)

  healthProbes.set(connectionId, timer)

  // Run first probe immediately
  probeLatency(connectionId)
}

// Stop health probe
function stopHealthProbe(connectionId: string): void {
  const timer = healthProbes.get(connectionId)
  if (timer) {
    clearInterval(timer)
    healthProbes.delete(connectionId)
  }
}

// Execute latency probe
function probeLatency(connectionId: string): void {
  const session = sshSessions.get(connectionId)
  if (!session?.client) {
    stopHealthProbe(connectionId)
    return
  }

  const start = Date.now()
  const timeout = setTimeout(() => {
    // Probe timed out
    emitHealth(connectionId, { rtt: -1, status: 'timeout' })
  }, 5000)

  session.client.exec('echo __STERMINAL_PING__', (err, stream) => {
    clearTimeout(timeout)

    if (err) {
      // exec might be disabled on restricted shells
      emitHealth(connectionId, { rtt: -1, status: 'unsupported' })
      stopHealthProbe(connectionId) // Don't keep probing if exec is disabled
      return
    }

    stream.on('data', () => {
      const rtt = Date.now() - start
      emitHealth(connectionId, { rtt, status: 'ok' })
      stream.close()
    })

    stream.on('close', () => {
      // stream closed without data = something went wrong
    })

    stream.stderr.on('data', () => {
      // Ignore stderr
    })
  })
}

// Emit health data to renderer
function emitHealth(connectionId: string, data: { rtt: number; status: string }): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send(IPC_SSH.HEALTH, connectionId, data)
  }
}

/**
 * 注册所有 SSH 相关的 IPC handlers
 */
export function registerSshHandlers(): void {
  // 建立 SSH 连接并打开 shell stream
  ipcMain.handle(IPC_SSH.CONNECT, async (event, params: {
    hostId: string
    hostConfig: Host
    cols?: number
    rows?: number
  }) => {
    const raw = params.hostConfig as unknown as Record<string, unknown>
    // 兼容数据库 snake_case 和内存 camelCase 两种字段名
    const hostConfig: Host = {
      id: (raw.id as string) || '',
      label: (raw.label as string) || undefined,
      address: (raw.address as string) || '',
      port: (raw.port as number) || 22,
      protocol: (raw.protocol as Host['protocol']) || 'ssh',
      username: (raw.username as string) || undefined,
      authType: (raw.authType || raw.auth_type || 'password') as Host['authType'],
      password: (raw.password || raw.password_enc || '') as string,
      keyId: (raw.keyId || raw.key_id || '') as string,
      keyPassphrase: (raw.keyPassphrase || raw.key_passphrase_enc || '') as string,
      encoding: (raw.encoding as string) || 'utf-8',
      keepaliveInterval: (raw.keepaliveInterval ?? raw.keepalive_interval ?? 60) as number,
      connectTimeout: (raw.connectTimeout ?? raw.connect_timeout ?? 10) as number,
      heartbeatTimeout: (raw.heartbeatTimeout ?? raw.heartbeat_timeout ?? 30) as number,
      compression: !!(raw.compression),
      strictHostKey: !!(raw.strictHostKey ?? raw.strict_host_key),
      sshVersion: (raw.sshVersion || raw.ssh_version || 'auto') as Host['sshVersion'],
      proxyJumpId: (raw.proxyJumpId || raw.proxy_jump_id || undefined) as string | undefined,
      socksProxy: (raw.socksProxy || raw.socks_proxy || undefined) as string | undefined,
      httpProxy: (raw.httpProxy || raw.http_proxy || undefined) as string | undefined,
      sortOrder: (raw.sortOrder ?? raw.sort_order ?? 0) as number,
      tagIds: (raw.tagIds as string[]) || [],
      connectCount: (raw.connectCount ?? raw.connect_count ?? 0) as number,
    }
    const connectionId = `ssh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const webContents = event.sender

    const cols = params.cols || 80
    const rows = params.rows || 24

    return new Promise<{ connectionId: string }>((resolve, reject) => {
      const conn = new Client()
      let settled = false

      const session: SshSession = {
        client: conn,
        stream: null,
        webContents,
        hostId: params.hostId,
        keepaliveInterval: hostConfig.keepaliveInterval,
      }
      sshSessions.set(connectionId, session)

      conn.on('ready', () => {
        webContents.send(IPC_SSH.STATUS, { connectionId, hostId: params.hostId, status: 'connected' })

        conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
          if (err) {
            webContents.send(IPC_SSH.ERROR, { connectionId, error: err.message })
            conn.end()
            sshSessions.delete(connectionId)
            if (!settled) { settled = true; reject(err) }
            return
          }

          session.stream = stream

          stream.on('data', (data: Buffer) => {
            const str = data.toString('utf-8')
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SSH.DATA, { connectionId, data: str })
            }
            recordData(connectionId, str)
          })

          stream.stderr.on('data', (data: Buffer) => {
            const str = data.toString('utf-8')
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SSH.DATA, { connectionId, data: str })
            }
            recordData(connectionId, str)
          })

          stream.on('close', () => {
            stopHealthProbe(connectionId)
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SSH.STATUS, { connectionId, status: 'disconnected' })
            }
            conn.end()
            sshSessions.delete(connectionId)
          })

          if (!settled) { settled = true; resolve({ connectionId }) }

          // 启动 SSH 连接健康监测
          startHealthProbe(connectionId)

          // 自动录制
          if (shouldAutoRecord()) {
            startRecording({
              terminalKey: connectionId,
              cols,
              rows,
              label: hostConfig.label || hostConfig.address,
              hostId: params.hostId,
            })
          }

          // 检测远端操作系统（带超时，不影响主连接）
          conn.exec('uname', (execErr, execStream) => {
            if (execErr) return
            let output = ''
            const timeout = setTimeout(() => { try { execStream.destroy() } catch {} }, 5000)
            execStream.on('data', (data: Buffer) => { if (output.length < 256) output += data.toString() })
            execStream.on('error', () => { clearTimeout(timeout) })
            execStream.on('close', () => {
              clearTimeout(timeout)
              const uname = output.trim().toLowerCase()
              let os: 'darwin' | 'windows' | 'linux' = 'linux'
              if (uname.includes('darwin')) os = 'darwin'
              else if (uname.includes('mingw') || uname.includes('cygwin') || uname.includes('msys') || uname.includes('windows')) os = 'windows'
              if (!webContents.isDestroyed()) {
                webContents.send(IPC_SSH.OS_DETECTED, { connectionId, os })
              }
            })
          })
        })
      })

      conn.on('error', (err) => {
        if (!webContents.isDestroyed()) {
          webContents.send(IPC_SSH.ERROR, { connectionId, error: err.message })
        }
        sshSessions.delete(connectionId)
        if (!settled) { settled = true; reject(err) }
      })

      conn.on('close', () => {
        stopHealthProbe(connectionId)
        if (!webContents.isDestroyed()) {
          webContents.send(IPC_SSH.STATUS, { connectionId, status: 'disconnected' })
        }
        sshSessions.delete(connectionId)
        if (!settled) { settled = true; reject(new Error('SSH connection closed unexpectedly')) }
      })

      // 构建连接配置
      const connectConfig: Parameters<Client['connect']>[0] = {
        host: hostConfig.address,
        port: hostConfig.port || 22,
        username: hostConfig.username || 'root',
        readyTimeout: (hostConfig.connectTimeout || 10) * 1000,
      }

      if (hostConfig.keepaliveInterval) {
        connectConfig.keepaliveInterval = hostConfig.keepaliveInterval * 1000
      }

      // 根据认证方式配置
      switch (hostConfig.authType) {
        case 'password':
          connectConfig.password = hostConfig.password || ''
          break
        case 'key':
        case 'password_key':
          if (hostConfig.authType === 'password_key') {
            connectConfig.password = hostConfig.password || ''
          }
          if (hostConfig.keyId) {
            // 从 keys 表查找私钥
            const keyRow = dbGet<{ private_key_enc: string; passphrase_enc: string | null }>(
              'SELECT private_key_enc, passphrase_enc FROM keys WHERE id = ?',
              [hostConfig.keyId]
            )
            if (keyRow) {
              // 尝试 E2EE 解密（如果是加密存储的）
              let privateKey = keyRow.private_key_enc
              try {
                if (e2eCrypto.hasKey()) privateKey = e2eCrypto.decrypt(privateKey)
              } catch { /* 可能是明文存储 */ }

              connectConfig.privateKey = privateKey

              // 密钥密码短语
              const passphrase = hostConfig.keyPassphrase || keyRow.passphrase_enc
              if (passphrase) {
                let pp = passphrase
                try {
                  if (e2eCrypto.hasKey()) pp = e2eCrypto.decrypt(pp)
                } catch { /* 可能是明文 */ }
                connectConfig.passphrase = pp
              }
            }
          }
          break
        case 'agent':
          connectConfig.agent = process.env.SSH_AUTH_SOCK
          break
        case 'keyboard':
          connectConfig.tryKeyboard = true
          break
        default:
          connectConfig.password = hostConfig.password || ''
      }

      // 主机密钥验证（ssh2 的 hostVerifier 签名: (key, verify) => void）
      connectConfig.hostVerifier = (key: Buffer, verify: (accept: boolean) => void) => {
        const fingerprint = crypto.createHash('sha256').update(key).digest('base64')
        const keyType = 'ssh-key'
        const host = hostConfig.address
        const port = hostConfig.port || 22

        // 查询已知主机
        const known = dbGet<{ fingerprint: string; id: string }>(
          'SELECT id, fingerprint FROM known_hosts WHERE host = ? AND port = ? AND key_type = ?',
          [host, port, keyType]
        )

        if (known) {
          if (known.fingerprint === fingerprint) {
            dbRun('UPDATE known_hosts SET last_seen = datetime(\'now\') WHERE id = ?', [known.id])
            return verify(true)
          }
          // 指纹变更 → 弹窗确认
          const verifyId = uuidv4()
          webContents.send(IPC_SSH.HOST_VERIFY, {
            verifyId, host, port, keyType,
            fingerprint: `SHA256:${fingerprint}`,
            oldFingerprint: `SHA256:${known.fingerprint}`,
            type: 'changed',
          })
          pendingHostVerify.set(verifyId, { resolve: (accept) => {
            if (accept) {
              dbRun('UPDATE known_hosts SET fingerprint = ?, public_key = ?, last_seen = datetime(\'now\') WHERE id = ?',
                [fingerprint, key.toString('base64'), known.id])
            }
            verify(accept)
          }})
          return undefined
        }

        // 首次连接 → 始终弹窗确认（无论 strictHostKey 设置）
        const verifyId = uuidv4()
        webContents.send(IPC_SSH.HOST_VERIFY, {
          verifyId, host, port, keyType,
          fingerprint: `SHA256:${fingerprint}`,
          type: 'new',
        })
        pendingHostVerify.set(verifyId, { resolve: (accept) => {
          if (accept) {
            dbRun(
              'INSERT INTO known_hosts (id, host, port, key_type, fingerprint, public_key) VALUES (?, ?, ?, ?, ?, ?)',
              [uuidv4(), host, port, keyType, fingerprint, key.toString('base64')]
            )
          }
          verify(accept)
        }})
        return undefined
      }

      conn.connect(connectConfig)
    })
  })

  // 向 SSH stream 写入数据
  ipcMain.handle(IPC_SSH.WRITE, async (_event, params: {
    connectionId: string
    data: string
  }) => {
    const session = sshSessions.get(params.connectionId)
    if (!session?.stream) return
    session.stream.write(params.data)
  })

  // 断开 SSH 连接
  ipcMain.handle(IPC_SSH.DISCONNECT, async (_event, params: { connectionId: string }) => {
    const session = sshSessions.get(params.connectionId)
    if (!session) return
    stopHealthProbe(params.connectionId)
    session.stream?.close()
    session.client.end()
    sshSessions.delete(params.connectionId)
  })

  // 调整终端大小
  ipcMain.handle(IPC_SSH.RESIZE, async (_event, params: {
    connectionId: string
    cols: number
    rows: number
  }) => {
    const session = sshSessions.get(params.connectionId)
    if (!session?.stream) return
    session.stream.setWindow(params.rows, params.cols, 0, 0)
  })

  // 用户响应主机密钥验证
  ipcMain.handle('ssh:host-verify-response', (_event, params: { verifyId: string; accept: boolean }) => {
    const pending = pendingHostVerify.get(params.verifyId)
    if (pending) {
      pendingHostVerify.delete(params.verifyId)
      pending.resolve(params.accept)
    }
  })

  // 已知主机列表
  ipcMain.handle('db:known-hosts:list', () => {
    return dbAll('SELECT * FROM known_hosts ORDER BY last_seen DESC')
  })

  // 删除已知主机
  ipcMain.handle('db:known-hosts:delete', (_event, id: string) => {
    dbRun('DELETE FROM known_hosts WHERE id = ?', [id])
    return true
  })
}

/**
 * 断开所有 SSH 连接（应用退出时调用）
 */
export function disconnectAllSsh(): void {
  // 先停止所有健康探测计时器
  for (const [id] of healthProbes) {
    stopHealthProbe(id)
  }
  for (const [id, session] of sshSessions) {
    try {
      session.stream?.close()
      session.client.end()
    } catch {
      // 忽略退出时的错误
    }
    sshSessions.delete(id)
  }
}
