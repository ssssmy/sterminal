// 端口转发隧道管理
// 管理 SSH 端口转发的生命周期（启动/停止/状态推送）

import { ipcMain, WebContents } from 'electron'
import net from 'net'
import { Client, ClientChannel } from 'ssh2'
import { IPC_PORT_FORWARD, IPC_DB } from '../../shared/types/ipc-channels'
import type { PortForward, TunnelStatus } from '../../shared/types/port-forward'
import type { Host } from '../../shared/types/host'
import { sshSessions } from './ssh.handler'
import { dbGet } from '../services/db'

function parsePortForwardRow(row: Record<string, unknown>): PortForward {
  return {
    id: row.id as string,
    name: row.name as string | undefined,
    type: row.type as PortForward['type'],
    hostId: row.host_id as string,
    localBindAddr: (row.local_bind_addr as string) || '127.0.0.1',
    localPort: row.local_port as number | undefined,
    remoteTargetAddr: row.remote_target_addr as string | undefined,
    remoteTargetPort: row.remote_target_port as number | undefined,
    remoteBindAddr: (row.remote_bind_addr as string) || '127.0.0.1',
    remotePort: row.remote_port as number | undefined,
    localTargetAddr: (row.local_target_addr as string) || '127.0.0.1',
    localTargetPort: row.local_target_port as number | undefined,
    autoStart: !!(row.auto_start),
    appStart: !!(row.app_start),
    groupId: row.group_id as string | undefined,
    sortOrder: (row.sort_order as number) || 0,
  }
}

interface ActiveTunnel {
  ruleId: string
  hostId: string
  type: PortForward['type']
  server?: net.Server
  sshClient: Client
  ownsSshClient: boolean
  activeChannels: Set<ClientChannel | net.Socket>
  status: TunnelStatus
  error?: string
  connectionCount: number
  bytesIn: number
  bytesOut: number
  startedAt: string
  webContents: WebContents
}

const activeTunnels = new Map<string, ActiveTunnel>()
const tunnelSshClients = new Map<string, Client>()

function emitStatus(tunnel: ActiveTunnel): void {
  if (tunnel.webContents.isDestroyed()) return
  tunnel.webContents.send(IPC_PORT_FORWARD.STATUS, {
    ruleId: tunnel.ruleId,
    status: tunnel.status,
    error: tunnel.error,
    connectionCount: tunnel.connectionCount,
    bytesIn: tunnel.bytesIn,
    bytesOut: tunnel.bytesOut,
    startedAt: tunnel.startedAt,
  })
}

/** 节流：隧道流量频繁更新时，限制 status 推送频率 */
const emitThrottle = new Map<string, NodeJS.Timeout>()
function emitStatusThrottled(tunnel: ActiveTunnel): void {
  if (emitThrottle.has(tunnel.ruleId)) return
  const timer = setTimeout(() => {
    emitThrottle.delete(tunnel.ruleId)
    emitStatus(tunnel)
  }, 500)
  emitThrottle.set(tunnel.ruleId, timer)
}

/** 查找同主机的其他活跃 SSH 连接 */
function findAlternativeSshClient(hostId: string, excludeClient: Client): Client | undefined {
  for (const session of sshSessions.values()) {
    if (session.client !== excludeClient && session.hostId === hostId) {
      return session.client
    }
  }
  const tunnelClient = tunnelSshClients.get(`tunnel_${hostId}`)
  if (tunnelClient && tunnelClient !== excludeClient) return tunnelClient
  return undefined
}

/** 监听 SSH 连接断开，迁移或停止使用该连接的隧道 */
function watchSshClientClose(sshClient: Client): void {
  if ((sshClient as any).__pfCloseWatched) return
  ;(sshClient as any).__pfCloseWatched = true

  let fired = false
  const onClose = () => {
    if (fired) return
    fired = true

    const affected: ActiveTunnel[] = []
    for (const tunnel of activeTunnels.values()) {
      if (tunnel.sshClient === sshClient) {
        affected.push(tunnel)
      }
    }
    if (affected.length === 0) return

    for (const tunnel of affected) {
      const altClient = findAlternativeSshClient(tunnel.hostId, sshClient)

      if (!altClient) {
        stopTunnel(tunnel.ruleId)
        continue
      }

      // 有同主机的其他连接，停止当前隧道再用新连接重启
      const { ruleId, webContents } = tunnel
      stopTunnel(ruleId)

      const row = dbGet<Record<string, unknown>>('SELECT * FROM port_forwards WHERE id = ?', [ruleId])
      if (!row) continue
      const rule = parsePortForwardRow(row)
      watchSshClientClose(altClient)
      if (rule.type === 'local') {
        startLocalForward(rule, altClient, false, webContents)
      } else if (rule.type === 'remote') {
        startRemoteForward(rule, altClient, false, webContents)
      } else if (rule.type === 'dynamic') {
        startDynamicForward(rule, altClient, false, webContents)
      }
    }
  }
  sshClient.on('close', onClose)
  sshClient.on('end', onClose)
  sshClient.on('error', onClose)
}

function loadHostConfig(hostId: string): Host | null {
  const row = dbGet<Record<string, unknown>>('SELECT * FROM hosts WHERE id = ?', [hostId])
  if (!row) return null
  return {
    id: row.id as string,
    address: row.address as string,
    port: (row.port as number) || 22,
    username: (row.username as string) || 'root',
    authType: (row.auth_type || 'password') as Host['authType'],
    password: (row.password_enc || '') as string,
    keyId: (row.key_id || '') as string,
    keyPassphrase: (row.key_passphrase_enc || '') as string,
    encoding: (row.encoding as string) || 'utf-8',
    keepaliveInterval: (row.keepalive_interval as number) ?? 60,
    connectTimeout: (row.connect_timeout as number) ?? 10,
    heartbeatTimeout: (row.heartbeat_timeout as number) ?? 30,
    compression: !!(row.compression),
    strictHostKey: !!(row.strict_host_key),
    sshVersion: (row.ssh_version || 'auto') as Host['sshVersion'],
    protocol: (row.protocol || 'ssh') as Host['protocol'],
    sortOrder: 0,
    tagIds: [],
    connectCount: 0,
  } as Host
}

function buildConnectConfig(host: Host): Parameters<Client['connect']>[0] {
  const config: Parameters<Client['connect']>[0] = {
    host: host.address,
    port: host.port || 22,
    username: host.username || 'root',
    readyTimeout: (host.connectTimeout || 10) * 1000,
  }
  if (host.keepaliveInterval) {
    config.keepaliveInterval = host.keepaliveInterval * 1000
  }
  switch (host.authType) {
    case 'password':
      config.password = host.password || ''
      break
    case 'key':
      if (host.keyId) config.privateKey = host.keyId
      if (host.keyPassphrase) config.passphrase = host.keyPassphrase
      break
    case 'password_key':
      config.password = host.password || ''
      if (host.keyId) config.privateKey = host.keyId
      if (host.keyPassphrase) config.passphrase = host.keyPassphrase
      break
    case 'agent':
      config.agent = process.env.SSH_AUTH_SOCK
      break
    case 'keyboard':
      config.tryKeyboard = true
      break
    default:
      config.password = host.password || ''
  }
  return config
}

async function getOrCreateSshClient(
  hostId: string,
  connectionId?: string,
): Promise<{ client: Client; owned: boolean }> {
  // 尝试复用现有终端连接
  if (connectionId) {
    const session = sshSessions.get(connectionId)
    if (session) return { client: session.client, owned: false }
  }

  // 尝试复用已有的隧道专用连接
  const existingKey = `tunnel_${hostId}`
  const existing = tunnelSshClients.get(existingKey)
  if (existing) return { client: existing, owned: false }

  // 建立新的专用连接
  const host = loadHostConfig(hostId)
  if (!host) throw new Error(`Host ${hostId} not found`)

  return new Promise((resolve, reject) => {
    const conn = new Client()
    conn.on('ready', () => {
      tunnelSshClients.set(existingKey, conn)
      resolve({ client: conn, owned: true })
    })
    conn.on('error', (err) => {
      tunnelSshClients.delete(existingKey)
      reject(err)
    })
    conn.on('close', () => {
      tunnelSshClients.delete(existingKey)
    })
    conn.connect(buildConnectConfig(host))
  })
}

function startLocalForward(rule: PortForward, sshClient: Client, owned: boolean, webContents: WebContents): void {
  const tunnel: ActiveTunnel = {
    ruleId: rule.id,
    hostId: rule.hostId,
    type: 'local',
    sshClient,
    ownsSshClient: owned,
    activeChannels: new Set(),
    status: 'starting',
    connectionCount: 0,
    bytesIn: 0,
    bytesOut: 0,
    startedAt: new Date().toISOString(),
    webContents,
  }
  activeTunnels.set(rule.id, tunnel)
  emitStatus(tunnel)
  watchSshClientClose(sshClient)

  const server = net.createServer((socket) => {
    tunnel.connectionCount++
    tunnel.activeChannels.add(socket)
    emitStatus(tunnel)

    sshClient.forwardOut(
      socket.remoteAddress || '127.0.0.1',
      socket.remotePort || 0,
      rule.remoteTargetAddr || '127.0.0.1',
      rule.remoteTargetPort || 80,
      (err, channel) => {
        if (err) {
          socket.end()
          tunnel.activeChannels.delete(socket)
          tunnel.connectionCount = Math.max(0, tunnel.connectionCount - 1)
          emitStatus(tunnel)
          return
        }
        tunnel.activeChannels.add(channel)

        // 手动 pipe + 字节统计（socket -> channel = 出站，channel -> socket = 入站）
        socket.on('data', (chunk: Buffer) => {
          tunnel.bytesOut += chunk.length
          channel.write(chunk)
          emitStatusThrottled(tunnel)
        })
        channel.on('data', (chunk: Buffer) => {
          tunnel.bytesIn += chunk.length
          socket.write(chunk)
          emitStatusThrottled(tunnel)
        })

        const cleanup = () => {
          tunnel.activeChannels.delete(socket)
          tunnel.activeChannels.delete(channel)
          tunnel.connectionCount = Math.max(0, tunnel.connectionCount - 1)
          emitStatus(tunnel)
          try { socket.destroy() } catch {}
          try { channel.close() } catch {}
        }
        socket.on('error', cleanup)
        socket.on('close', cleanup)
        channel.on('error', cleanup)
        channel.on('close', cleanup)
      }
    )
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    tunnel.status = 'error'
    if (err.code === 'EADDRINUSE') {
      tunnel.error = `本地端口 ${rule.localBindAddr}:${rule.localPort} 已被占用`
    } else if (err.code === 'EACCES') {
      tunnel.error = `无权限绑定本地端口 ${rule.localPort}（端口 < 1024 需管理员权限）`
    } else {
      tunnel.error = `本地监听失败: ${err.message}`
    }
    emitStatus(tunnel)
    activeTunnels.delete(rule.id)
  })

  server.listen(rule.localPort, rule.localBindAddr || '127.0.0.1', () => {
    tunnel.status = 'active'
    tunnel.server = server
    emitStatus(tunnel)
  })
}

function startRemoteForward(rule: PortForward, sshClient: Client, owned: boolean, webContents: WebContents): void {
  const tunnel: ActiveTunnel = {
    ruleId: rule.id,
    hostId: rule.hostId,
    type: 'remote',
    sshClient,
    ownsSshClient: owned,
    activeChannels: new Set(),
    status: 'starting',
    connectionCount: 0,
    bytesIn: 0,
    bytesOut: 0,
    startedAt: new Date().toISOString(),
    webContents,
  }
  activeTunnels.set(rule.id, tunnel)
  emitStatus(tunnel)
  watchSshClientClose(sshClient)

  sshClient.forwardIn(
    rule.remoteBindAddr || '127.0.0.1',
    rule.remotePort || 0,
    (err) => {
      if (err) {
        tunnel.status = 'error'
        tunnel.error = `远程端口 ${rule.remoteBindAddr}:${rule.remotePort} 绑定失败: ${err.message}`
        emitStatus(tunnel)
        activeTunnels.delete(rule.id)
        return
      }
      tunnel.status = 'active'
      emitStatus(tunnel)
    }
  )

  sshClient.on('tcp connection', (_info, accept, reject) => {
    if (tunnel.status !== 'active') { reject(); return }

    const channel = accept()
    tunnel.connectionCount++
    tunnel.activeChannels.add(channel)
    emitStatus(tunnel)

    const localSocket = net.createConnection(
      rule.localTargetPort || 80,
      rule.localTargetAddr || '127.0.0.1',
      () => {
        // 手动 pipe + 字节统计（channel -> localSocket = 入站，localSocket -> channel = 出站）
        channel.on('data', (chunk: Buffer) => {
          tunnel.bytesIn += chunk.length
          localSocket.write(chunk)
          emitStatusThrottled(tunnel)
        })
        localSocket.on('data', (chunk: Buffer) => {
          tunnel.bytesOut += chunk.length
          channel.write(chunk)
          emitStatusThrottled(tunnel)
        })
      }
    )

    const cleanup = () => {
      tunnel.activeChannels.delete(channel)
      tunnel.activeChannels.delete(localSocket)
      tunnel.connectionCount = Math.max(0, tunnel.connectionCount - 1)
      emitStatus(tunnel)
      try { localSocket.destroy() } catch {}
      try { channel.close() } catch {}
    }
    localSocket.on('error', cleanup)
    localSocket.on('close', cleanup)
    channel.on('error', cleanup)
    channel.on('close', cleanup)
  })
}

/**
 * Dynamic 转发（SOCKS5 代理）：本地监听 SOCKS5 端口，通过 SSH 建立隧道到目标地址
 */
function startDynamicForward(rule: PortForward, sshClient: Client, owned: boolean, webContents: WebContents): void {
  const tunnel: ActiveTunnel = {
    ruleId: rule.id,
    hostId: rule.hostId,
    type: 'dynamic',
    sshClient,
    ownsSshClient: owned,
    activeChannels: new Set(),
    status: 'starting',
    connectionCount: 0,
    bytesIn: 0,
    bytesOut: 0,
    startedAt: new Date().toISOString(),
    webContents,
  }
  activeTunnels.set(rule.id, tunnel)
  emitStatus(tunnel)
  watchSshClientClose(sshClient)

  const server = net.createServer((socket) => {
    tunnel.activeChannels.add(socket)

    let state: 'greeting' | 'request' | 'established' = 'greeting'
    let buf: Buffer = Buffer.alloc(0)
    let channel: ClientChannel | undefined

    const destroyConn = () => {
      tunnel.activeChannels.delete(socket)
      if (channel) tunnel.activeChannels.delete(channel)
      tunnel.connectionCount = Math.max(0, tunnel.connectionCount - 1)
      emitStatus(tunnel)
      try { socket.destroy() } catch {}
      try { channel?.close() } catch {}
    }

    socket.on('error', destroyConn)
    socket.on('close', destroyConn)

    socket.on('data', (chunk: Buffer) => {
      if (state === 'established' && channel) {
        tunnel.bytesOut += chunk.length
        channel.write(chunk)
        emitStatusThrottled(tunnel)
        return
      }

      buf = Buffer.concat([buf, chunk])

      if (state === 'greeting') {
        // [VER=0x05, NMETHODS, METHODS...]
        if (buf.length < 2) return
        const nmethods = buf[1]
        if (buf.length < 2 + nmethods) return
        if (buf[0] !== 0x05) { destroyConn(); return }
        // 回复无需认证
        socket.write(Buffer.from([0x05, 0x00]))
        buf = buf.subarray(2 + nmethods)
        state = 'request'
      }

      if (state === 'request') {
        // [VER=0x05, CMD, RSV, ATYP, DST.ADDR, DST.PORT]
        if (buf.length < 4) return
        const ver = buf[0]
        const cmd = buf[1]
        const atyp = buf[3]
        if (ver !== 0x05 || cmd !== 0x01) {
          // 仅支持 CONNECT
          socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
          destroyConn()
          return
        }

        let targetHost = ''
        let targetPort = 0
        let headerEnd = 0

        if (atyp === 0x01) {
          // IPv4
          if (buf.length < 4 + 4 + 2) return
          targetHost = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`
          targetPort = buf.readUInt16BE(8)
          headerEnd = 10
        } else if (atyp === 0x03) {
          // 域名
          if (buf.length < 5) return
          const addrLen = buf[4]
          if (buf.length < 5 + addrLen + 2) return
          targetHost = buf.subarray(5, 5 + addrLen).toString('utf8')
          targetPort = buf.readUInt16BE(5 + addrLen)
          headerEnd = 5 + addrLen + 2
        } else {
          // 不支持 IPv6 (0x04) 等
          socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
          destroyConn()
          return
        }

        const leftover = buf.subarray(headerEnd)
        buf = Buffer.alloc(0)

        // 通过 SSH 建立隧道
        sshClient.forwardOut(
          socket.remoteAddress || '127.0.0.1',
          socket.remotePort || 0,
          targetHost,
          targetPort,
          (err, ch) => {
            if (err) {
              // 0x05 = Connection refused
              socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
              destroyConn()
              return
            }
            channel = ch
            tunnel.activeChannels.add(ch)
            tunnel.connectionCount++
            emitStatus(tunnel)

            // 回复成功：VER=5, REP=0, RSV=0, ATYP=1, 0.0.0.0:0
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
            state = 'established'

            // 处理客户端在握手完成前发送的剩余数据
            if (leftover.length > 0) {
              tunnel.bytesOut += leftover.length
              ch.write(leftover)
            }

            ch.on('data', (d: Buffer) => {
              tunnel.bytesIn += d.length
              socket.write(d)
              emitStatusThrottled(tunnel)
            })
            ch.on('error', destroyConn)
            ch.on('close', destroyConn)
          }
        )
      }
    })
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    tunnel.status = 'error'
    if (err.code === 'EADDRINUSE') {
      tunnel.error = `本地端口 ${rule.localBindAddr}:${rule.localPort} 已被占用`
    } else if (err.code === 'EACCES') {
      tunnel.error = `无权限绑定本地端口 ${rule.localPort}（端口 < 1024 需管理员权限）`
    } else {
      tunnel.error = `本地监听失败: ${err.message}`
    }
    emitStatus(tunnel)
    activeTunnels.delete(rule.id)
  })

  server.listen(rule.localPort, rule.localBindAddr || '127.0.0.1', () => {
    tunnel.status = 'active'
    tunnel.server = server
    emitStatus(tunnel)
  })
}

function stopTunnel(ruleId: string, errorMsg?: string): void {
  const tunnel = activeTunnels.get(ruleId)
  if (!tunnel) return

  // 先从 map 中移除，防止 close 事件回调重入
  activeTunnels.delete(ruleId)

  // 关闭 net.Server 并强制断开所有已有连接
  if (tunnel.server) {
    // 先销毁所有活跃 socket，再 close server
    for (const ch of tunnel.activeChannels) {
      try { (ch as any).destroy?.() || (ch as any).close?.() } catch {}
    }
    tunnel.activeChannels.clear()
    try { tunnel.server.close() } catch {}
  }

  // 如果是 remote 转发，取消 forwardIn
  if (tunnel.type === 'remote') {
    try {
      tunnel.sshClient.unforwardIn('127.0.0.1', 0)
    } catch {}
    for (const ch of tunnel.activeChannels) {
      try { (ch as any).destroy?.() || (ch as any).close?.() } catch {}
    }
    tunnel.activeChannels.clear()
  }

  // 如果是专用 SSH 连接且没有其他隧道使用，断开
  if (tunnel.ownsSshClient) {
    const otherTunnelsUsingSameClient = [...activeTunnels.values()].some(
      t => t.sshClient === tunnel.sshClient
    )
    if (!otherTunnelsUsingSameClient) {
      try { tunnel.sshClient.end() } catch {}
    }
  }

  if (errorMsg) {
    tunnel.status = 'error'
    tunnel.error = errorMsg
  } else {
    tunnel.status = 'inactive'
  }
  emitStatus(tunnel)
}

export function stopAllTunnels(): void {
  const ruleIds = [...activeTunnels.keys()]
  for (const id of ruleIds) {
    try { stopTunnel(id) } catch {}
  }
  // 关闭所有专用隧道 SSH 连接
  for (const [key, client] of tunnelSshClients) {
    try { client.end() } catch {}
    tunnelSshClients.delete(key)
  }
}

export function registerPortForwardHandlers(): void {
  ipcMain.handle(IPC_PORT_FORWARD.START, async (event, params: {
    ruleId: string
    connectionId?: string
  }) => {
    const { ruleId, connectionId } = params
    const webContents = event.sender

    // 已经在运行
    if (activeTunnels.has(ruleId)) {
      return { success: false, error: '该转发规则已在运行' }
    }

    // 加载规则
    const row = dbGet<Record<string, unknown>>('SELECT * FROM port_forwards WHERE id = ?', [ruleId])
    if (!row) return { success: false, error: '转发规则不存在' }

    const rule = parsePortForwardRow(row)

    try {
      const { client, owned } = await getOrCreateSshClient(rule.hostId, connectionId)

      if (rule.type === 'local') {
        startLocalForward(rule, client, owned, webContents)
      } else if (rule.type === 'remote') {
        startRemoteForward(rule, client, owned, webContents)
      } else if (rule.type === 'dynamic') {
        startDynamicForward(rule, client, owned, webContents)
      } else {
        return { success: false, error: '未知的转发类型' }
      }

      return { success: true }
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
        return { success: false, error: `SSH 连接失败: ${msg}` }
      }
      if (msg.includes('Authentication') || msg.includes('auth')) {
        return { success: false, error: `SSH 认证失败: ${msg}` }
      }
      return { success: false, error: `启动失败: ${msg}` }
    }
  })

  ipcMain.handle(IPC_PORT_FORWARD.STOP, async (_event, params: { ruleId: string }) => {
    stopTunnel(params.ruleId)
    return { success: true }
  })

  ipcMain.handle(IPC_PORT_FORWARD.STOP_ALL, async () => {
    stopAllTunnels()
    return { success: true }
  })

  ipcMain.handle(IPC_PORT_FORWARD.LIST_ACTIVE, async () => {
    const result: Record<string, unknown>[] = []
    for (const [ruleId, tunnel] of activeTunnels) {
      result.push({
        ruleId,
        status: tunnel.status,
        error: tunnel.error,
        connectionCount: tunnel.connectionCount,
        bytesIn: tunnel.bytesIn,
        bytesOut: tunnel.bytesOut,
        startedAt: tunnel.startedAt,
      })
    }
    return result
  })
}
