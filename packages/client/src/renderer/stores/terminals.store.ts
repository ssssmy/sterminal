// 本地终端配置 Store

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LocalTerminalConfig } from '@shared/types/terminal'
import { useIpc } from '../composables/useIpc'
import { IPC_DB } from '@shared/types/ipc-channels'

/**
 * 将 DB snake_case 行转为 camelCase LocalTerminalConfig
 */
function mapDbRow(row: Record<string, unknown>): LocalTerminalConfig {
  return {
    id: row.id as string,
    name: (row.name as string) || '本地终端',
    icon: (row.icon as string) || undefined,
    color: (row.color as string) || undefined,
    shell: (row.shell as string) || undefined,
    cwd: (row.cwd as string) || undefined,
    startupCommand: (row.startupCommand || row.startup_command || undefined) as string | undefined,
    scriptLineDelay: (row.scriptLineDelay ?? row.script_line_delay ?? 0) as number,
    loginShell: !!(row.loginShell ?? row.login_shell),
    isDefault: !!(row.isDefault ?? row.is_default),
    sortOrder: (row.sortOrder ?? row.sort_order ?? 0) as number,
    groupId: (row.groupId || row.group_id || undefined) as string | undefined,
  }
}

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
      const rows = await invoke<Record<string, unknown>[]>(IPC_DB.LOCAL_TERMINALS_LIST)
      terminals.value = (rows || []).map(mapDbRow)
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建本地终端配置
   */
  async function createTerminal(data: Partial<LocalTerminalConfig>): Promise<LocalTerminalConfig> {
    const row = await invoke<Record<string, unknown>>(IPC_DB.LOCAL_TERMINALS_CREATE, data)
    const terminal = row ? mapDbRow(row) : { id: `t_${Date.now()}`, name: data.name || '本地终端', scriptLineDelay: 0, loginShell: true, isDefault: false, sortOrder: terminals.value.length, ...data } as LocalTerminalConfig
    terminals.value.push(terminal)
    return terminal
  }

  /**
   * 更新本地终端配置
   */
  async function updateTerminal(id: string, data: Partial<LocalTerminalConfig>): Promise<void> {
    const row = await invoke<Record<string, unknown>>(IPC_DB.LOCAL_TERMINALS_UPDATE, id, data)
    if (row) {
      const idx = terminals.value.findIndex(t => t.id === id)
      if (idx !== -1) terminals.value[idx] = mapDbRow(row)
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
