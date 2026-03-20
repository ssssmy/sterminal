// 主机管理 Store
// 管理 SSH 主机列表、分组和标签

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Host, HostGroup, Tag } from '@shared/types/host'
import { useIpc } from '../composables/useIpc'
import { IPC_DB } from '@shared/types/ipc-channels'

/**
 * 将数据库 snake_case 行转为 camelCase Host 对象
 */
function mapDbRowToHost(row: Record<string, unknown>): Host {
  return {
    id: row.id as string,
    label: (row.label as string) || undefined,
    address: row.address as string,
    port: (row.port as number) || 22,
    protocol: (row.protocol as Host['protocol']) || 'ssh',
    username: (row.username as string) || undefined,
    authType: (row.authType || row.auth_type || 'password') as Host['authType'],
    password: (row.password || row.password_enc || undefined) as string | undefined,
    keyId: (row.keyId || row.key_id || undefined) as string | undefined,
    keyPassphrase: (row.keyPassphrase || row.key_passphrase_enc || undefined) as string | undefined,
    startupCommand: (row.startupCommand || row.startup_command || undefined) as string | undefined,
    encoding: (row.encoding as string) || 'utf-8',
    keepaliveInterval: (row.keepaliveInterval ?? row.keepalive_interval ?? 60) as number,
    connectTimeout: (row.connectTimeout ?? row.connect_timeout ?? 10) as number,
    heartbeatTimeout: (row.heartbeatTimeout ?? row.heartbeat_timeout ?? 30) as number,
    compression: !!(row.compression),
    strictHostKey: !!(row.strictHostKey ?? row.strict_host_key),
    sshVersion: (row.sshVersion || row.ssh_version || 'auto') as Host['sshVersion'],
    proxyJumpId: (row.proxyJumpId || row.proxy_jump_id || undefined) as string | undefined,
    socksProxy: (row.socksProxy || row.socks_proxy || undefined) as string | undefined,
    httpProxy: (row.httpProxy || row.http_proxy || undefined) as string | undefined,
    notes: (row.notes as string) || undefined,
    groupId: (row.groupId || row.group_id || undefined) as string | undefined,
    sortOrder: (row.sortOrder ?? row.sort_order ?? 0) as number,
    tagIds: (row.tagIds as string[]) || [],
    lastConnected: (row.lastConnected || row.last_connected || undefined) as string | undefined,
    connectCount: (row.connectCount ?? row.connect_count ?? 0) as number,
  }
}

export const useHostsStore = defineStore('hosts', () => {
  const { invoke } = useIpc()

  // ===== 状态 =====
  const hosts = ref<Host[]>([])
  const groups = ref<HostGroup[]>([])
  const tags = ref<Tag[]>([])
  const loading = ref(false)

  // ===== 操作 =====

  async function fetchHosts(): Promise<void> {
    loading.value = true
    try {
      const rows = await invoke<Record<string, unknown>[]>(IPC_DB.HOSTS_LIST)
      hosts.value = (rows || []).map(mapDbRowToHost)
    } finally {
      loading.value = false
    }
  }

  async function fetchGroups(): Promise<void> {
    const rows = await invoke<HostGroup[]>(IPC_DB.HOST_GROUPS_LIST)
    groups.value = rows || []
  }

  async function fetchTags(): Promise<void> {
    const rows = await invoke<Tag[]>(IPC_DB.TAGS_LIST)
    tags.value = rows || []
  }

  async function createHost(data: Partial<Host>): Promise<Host> {
    const row = await invoke<Record<string, unknown>>(IPC_DB.HOSTS_CREATE, data)
    if (row) {
      const host = mapDbRowToHost(row)
      hosts.value.push(host)
      return host
    }
    // fallback: 直接用传入数据构建
    const fallback: Host = {
      id: `h_${Date.now()}`,
      address: data.address || '',
      port: data.port || 22,
      protocol: 'ssh',
      authType: data.authType || 'password',
      encoding: data.encoding || 'utf-8',
      keepaliveInterval: data.keepaliveInterval ?? 60,
      connectTimeout: data.connectTimeout ?? 10,
      heartbeatTimeout: 30,
      compression: data.compression ?? false,
      strictHostKey: data.strictHostKey ?? false,
      sshVersion: data.sshVersion || 'auto',
      sortOrder: hosts.value.length,
      tagIds: [],
      connectCount: 0,
      ...data,
    } as Host
    hosts.value.push(fallback)
    return fallback
  }

  async function updateHost(id: string, data: Partial<Host>): Promise<void> {
    const row = await invoke<Record<string, unknown>>(IPC_DB.HOSTS_UPDATE, id, data)
    if (row) {
      const idx = hosts.value.findIndex(h => h.id === id)
      if (idx !== -1) hosts.value[idx] = mapDbRowToHost(row)
    }
  }

  async function deleteHost(id: string): Promise<void> {
    await invoke(IPC_DB.HOSTS_DELETE, id)
    hosts.value = hosts.value.filter(h => h.id !== id)
  }

  return {
    hosts,
    groups,
    tags,
    loading,
    fetchHosts,
    fetchGroups,
    fetchTags,
    createHost,
    updateHost,
    deleteHost,
  }
})
