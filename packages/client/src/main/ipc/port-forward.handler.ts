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

interface ActiveTunnel {
  ruleId: string
  type: PortForward['type']
  server?: net.Server
  sshClient: Client
  ownsSshClient: boolean
  activeChannels: Set<ClientChannel | net.Socket>
  status: TunnelStatus
  error?: string
  connectionCount: number
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
    startedAt: tunnel.startedAt,
  })
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
    type: 'local',
    sshClient,
    ownsSshClient: owned,
    activeChannels: new Set(),
    status: 'starting',
    connectionCount: 0,
    startedAt: new Date().toISOString(),
    webContents,
  }
  activeTunnels.set(rule.id, tunnel)
  emitStatus(tunnel)

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
        socket.pipe(channel).pipe(socket)

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
    type: 'remote',
    sshClient,
    ownsSshClient: owned,
    activeChannels: new Set(),
    status: 'starting',
    connectionCount: 0,
    startedAt: new Date().toISOString(),
    webContents,
  }
  activeTunnels.set(rule.id, tunnel)
  emitStatus(tunnel)

  sshClient.forwardIn(
    rule.remoteBindAddr || '127.0.0.1',
    rule.remotePort || 0,
    (err) => {
      if (err) {
        tunnel.status = 'error'
        tunnel.error = `远程端口 ${rule.remoteBindAddr}:${rule.remotePort} 绑定失败: ${err.message}`
        emitStatus(tunnel)
        return
      }
      tunnel.status = 'active'
      emitStatus(tunnel)
    }
  )

  sshClient.on('tcp connection', (info, accept, reject) => {
    if (tunnel.status !== 'active') { reject(); return }

    const channel = accept()
    tunnel.connectionCount++
    tunnel.activeChannels.add(channel)
    emitStatus(tunnel)

    const localSocket = net.createConnection(
      rule.localTargetPort || 80,
      rule.localTargetAddr || '127.0.0.1',
      () => {
        channel.pipe(localSocket).pipe(channel)
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

function stopTunnel(ruleId: string): void {
  const tunnel = activeTunnels.get(ruleId)
  if (!tunnel) return

  tunnel.status = 'stopping'
  emitStatus(tunnel)

  // 关闭 net.Server（local 转发）
  if (tunnel.server) {
    tunnel.server.close()
  }

  // 如果是 remote 转发，取消 forwardIn
  if (tunnel.type === 'remote') {
    try {
      tunnel.sshClient.unforwardIn(
        '127.0.0.1', // 需要记录绑定地址和端口
        0
      )
    } catch {}
  }

  // 关闭所有活跃的 channel/socket
  for (const ch of tunnel.activeChannels) {
    try {
      if ('destroy' in ch) (ch as net.Socket).destroy()
      else (ch as ClientChannel).close()
    } catch {}
  }
  tunnel.activeChannels.clear()

  // 如果是专用 SSH 连接且没有其他隧道使用，断开
  if (tunnel.ownsSshClient) {
    const otherTunnelsUsingSameClient = [...activeTunnels.values()].some(
      t => t !== tunnel && t.sshClient === tunnel.sshClient
    )
    if (!otherTunnelsUsingSameClient) {
      try { tunnel.sshClient.end() } catch {}
    }
  }

  tunnel.status = 'inactive'
  emitStatus(tunnel)
  activeTunnels.delete(ruleId)
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

    const rule: PortForward = {
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

    try {
      const { client, owned } = await getOrCreateSshClient(rule.hostId, connectionId)

      if (rule.type === 'local') {
        startLocalForward(rule, client, owned, webContents)
      } else if (rule.type === 'remote') {
        startRemoteForward(rule, client, owned, webContents)
      } else {
        return { success: false, error: 'Dynamic 转发暂未支持' }
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
        startedAt: tunnel.startedAt,
      })
    }
    return result
  })
}
