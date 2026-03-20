// 主机管理 Store
// 管理 SSH 主机列表、分组和标签

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Host, HostGroup, Tag } from '@shared/types/host'
import { useIpc } from '../composables/useIpc'
import { IPC_DB } from '@shared/types/ipc-channels'

export const useHostsStore = defineStore('hosts', () => {
  const { invoke } = useIpc()

  // ===== 状态 =====
  const hosts = ref<Host[]>([])
  const groups = ref<HostGroup[]>([])
  const tags = ref<Tag[]>([])
  const loading = ref(false)

  // ===== 操作 =====

  /**
   * 加载主机列表
   */
  async function fetchHosts(): Promise<void> {
    loading.value = true
    try {
      const rows = await invoke<Host[]>(IPC_DB.HOSTS_LIST)
      hosts.value = rows || []
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载主机分组
   */
  async function fetchGroups(): Promise<void> {
    const rows = await invoke<HostGroup[]>(IPC_DB.HOST_GROUPS_LIST)
    groups.value = rows || []
  }

  /**
   * 加载标签列表
   */
  async function fetchTags(): Promise<void> {
    const rows = await invoke<Tag[]>(IPC_DB.TAGS_LIST)
    tags.value = rows || []
  }

  /**
   * 创建主机
   */
  async function createHost(data: Partial<Host>): Promise<Host> {
    const newHost = await invoke<Host>(IPC_DB.HOSTS_CREATE, data)
    if (newHost) hosts.value.push(newHost)
    return newHost!
  }

  /**
   * 更新主机
   */
  async function updateHost(id: string, data: Partial<Host>): Promise<void> {
    const updated = await invoke<Host>(IPC_DB.HOSTS_UPDATE, id, data)
    if (updated) {
      const idx = hosts.value.findIndex(h => h.id === id)
      if (idx !== -1) hosts.value[idx] = updated
    }
  }

  /**
   * 删除主机
   */
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
