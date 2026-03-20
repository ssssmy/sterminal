// 本地终端配置 Store

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LocalTerminalConfig } from '@shared/types/terminal'
import { useIpc } from '../composables/useIpc'
import { IPC_DB } from '@shared/types/ipc-channels'

export const useTerminalsStore = defineStore('terminals', () => {
  const { invoke } = useIpc()

  // ===== 状态 =====
  const terminals = ref<LocalTerminalConfig[]>([])
  const loading = ref(false)

  // ===== 操作 =====

  /**
   * 加载所有本地终端配置
   */
  async function fetchTerminals(): Promise<void> {
    loading.value = true
    try {
      const rows = await invoke<LocalTerminalConfig[]>(IPC_DB.LOCAL_TERMINALS_LIST)
      terminals.value = rows || []
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建本地终端配置
   */
  async function createTerminal(data: Partial<LocalTerminalConfig>): Promise<LocalTerminalConfig> {
    const newTerminal = await invoke<LocalTerminalConfig>(IPC_DB.LOCAL_TERMINALS_CREATE, data)
    if (newTerminal) terminals.value.push(newTerminal)
    return newTerminal!
  }

  /**
   * 更新本地终端配置
   */
  async function updateTerminal(id: string, data: Partial<LocalTerminalConfig>): Promise<void> {
    const updated = await invoke<LocalTerminalConfig>(IPC_DB.LOCAL_TERMINALS_UPDATE, id, data)
    if (updated) {
      const idx = terminals.value.findIndex(t => t.id === id)
      if (idx !== -1) terminals.value[idx] = updated
    }
  }

  /**
   * 删除本地终端配置
   */
  async function deleteTerminal(id: string): Promise<void> {
    await invoke(IPC_DB.LOCAL_TERMINALS_DELETE, id)
    terminals.value = terminals.value.filter(t => t.id !== id)
  }

  /**
   * 获取默认终端配置
   */
  function getDefault(): LocalTerminalConfig | undefined {
    return terminals.value.find(t => t.isDefault)
  }

  return {
    terminals,
    loading,
    fetchTerminals,
    createTerminal,
    updateTerminal,
    deleteTerminal,
    getDefault,
  }
})
