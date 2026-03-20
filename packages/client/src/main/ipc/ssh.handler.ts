// SSH IPC Handler
// 使用 ssh2 库管理 SSH 连接生命周期

import { ipcMain, WebContents } from 'electron'
import { Client, ClientChannel } from 'ssh2'
import { IPC_SSH } from '../../shared/types/ipc-channels'
import type { Host } from '../../shared/types/host'

interface SshSession {
  client: Client
  stream: ClientChannel | null
  webContents: WebContents
}

const sshSessions = new Map<string, SshSession>()

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
      }
      sshSessions.set(connectionId, session)

      conn.on('ready', () => {
        webContents.send(IPC_SSH.STATUS, { connectionId, status: 'connected' })

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
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SSH.DATA, { connectionId, data: data.toString('utf-8') })
            }
          })

          stream.stderr.on('data', (data: Buffer) => {
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SSH.DATA, { connectionId, data: data.toString('utf-8') })
            }
          })

          stream.on('close', () => {
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SSH.STATUS, { connectionId, status: 'disconnected' })
            }
            conn.end()
            sshSessions.delete(connectionId)
          })

          if (!settled) { settled = true; resolve({ connectionId }) }
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
          if (hostConfig.keyPassphrase) {
            connectConfig.passphrase = hostConfig.keyPassphrase
          }
          // keyId 指向密钥内容或路径，此处传入私钥内容
          if (hostConfig.keyId) {
            connectConfig.privateKey = hostConfig.keyId
          }
          break
        case 'password_key':
          connectConfig.password = hostConfig.password || ''
          if (hostConfig.keyId) {
            connectConfig.privateKey = hostConfig.keyId
          }
          if (hostConfig.keyPassphrase) {
            connectConfig.passphrase = hostConfig.keyPassphrase
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
}

/**
 * 断开所有 SSH 连接（应用退出时调用）
 */
export function disconnectAllSsh(): void {
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
