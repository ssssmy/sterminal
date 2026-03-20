// 本地终端配置 Store

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LocalTerminalConfig, LocalTerminalGroup } from '@shared/types/terminal'
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
  const groups = ref<LocalTerminalGroup[]>([])
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
    // 设为默认时，先清除本地 store 中其他终端的默认标记
    if (data.isDefault) {
      terminals.value.forEach(t => { t.isDefault = false })
    }
    const row = await invoke<Record<string, unknown>>(IPC_DB.LOCAL_TERMINALS_CREATE, data)
    const terminal = row ? mapDbRow(row) : { id: `t_${Date.now()}`, name: data.name || '本地终端', scriptLineDelay: 0, loginShell: true, isDefault: false, sortOrder: terminals.value.length, ...data } as LocalTerminalConfig
    terminals.value.push(terminal)
    return terminal
  }

  /**
   * 更新本地终端配置
   */
  async function updateTerminal(id: string, data: Partial<LocalTerminalConfig>): Promise<void> {
    // 设为默认时，先清除本地 store 中其他终端的默认标记
    if (data.isDefault) {
      terminals.value.forEach(t => {
        if (t.id !== id) t.isDefault = false
      })
    }
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

  // ===== 分组操作 =====

  async function fetchGroups(): Promise<void> {
    const rows = await invoke<LocalTerminalGroup[]>(IPC_DB.LOCAL_TERMINAL_GROUPS_LIST)
    groups.value = rows || []
  }

  async function createGroup(data: Partial<LocalTerminalGroup>): Promise<LocalTerminalGroup | null> {
    const row = await invoke<LocalTerminalGroup>(IPC_DB.LOCAL_TERMINAL_GROUPS_CREATE, data)
    if (row) {
      groups.value.push(row)
      return row
    }
    return null
  }

  async function updateGroup(id: string, data: Partial<LocalTerminalGroup>): Promise<void> {
    const row = await invoke<LocalTerminalGroup>(IPC_DB.LOCAL_TERMINAL_GROUPS_UPDATE, id, data)
    if (row) {
      const idx = groups.value.findIndex(g => g.id === id)
      if (idx !== -1) groups.value[idx] = row
    }
  }

  async function deleteGroup(id: string): Promise<void> {
    await invoke(IPC_DB.LOCAL_TERMINAL_GROUPS_DELETE, id)
    groups.value = groups.value.filter(g => g.id !== id)
    terminals.value.forEach(t => {
      if (t.groupId === id) t.groupId = undefined
    })
  }

  // ===== 拖拽移动 =====

  async function moveTerminal(terminalId: string, targetGroupId: string | null, targetIndex: number): Promise<void> {
    const terminal = terminals.value.find(t => t.id === terminalId)
    if (!terminal) return

    const siblings = terminals.value
      .filter(t => (t.groupId || null) === targetGroupId && t.id !== terminalId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    siblings.splice(targetIndex, 0, terminal)

    const newGroupId = targetGroupId || undefined
    terminal.groupId = newGroupId
    siblings.forEach((t, i) => { t.sortOrder = i })

    await invoke(IPC_DB.LOCAL_TERMINALS_UPDATE, terminalId, { groupId: newGroupId, sortOrder: targetIndex })

    for (const t of siblings) {
      if (t.id !== terminalId) {
        await invoke(IPC_DB.LOCAL_TERMINALS_UPDATE, t.id, { sortOrder: t.sortOrder })
      }
    }
  }

  return {
    terminals,
    groups,
    loading,
    fetchTerminals,
    createTerminal,
    updateTerminal,
    deleteTerminal,
    getDefault,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    moveTerminal,
  }
})
