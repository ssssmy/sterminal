// 端口转发 Store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { PortForward, TunnelState } from '@shared/types/port-forward'
import { useIpc } from '../composables/useIpc'
import { IPC_DB, IPC_PORT_FORWARD, IPC_SSH } from '@shared/types/ipc-channels'
import { useSessionsStore } from './sessions.store'

export const usePortForwardsStore = defineStore('portForwards', () => {
  const { invoke, on } = useIpc()

  const rules = ref<PortForward[]>([])
  const tunnelStates = ref<Map<string, TunnelState>>(new Map())
  const loading = ref(false)

  // ===== 计算属性 =====

  const rulesByHost = computed(() => {
    const map = new Map<string, PortForward[]>()
    const sorted = [...rules.value].sort((a, b) => a.sortOrder - b.sortOrder)
    for (const r of sorted) {
      if (!map.has(r.hostId)) map.set(r.hostId, [])
      map.get(r.hostId)!.push(r)
    }
    return map
  })

  const activeRules = computed(() =>
    rules.value.filter(r => {
      const state = tunnelStates.value.get(r.id)
      return state && (state.status === 'active' || state.status === 'starting')
    })
  )

  // ===== CRUD =====

  async function fetchRules(): Promise<void> {
    loading.value = true
    try {
      const rows = await invoke<PortForward[]>(IPC_DB.PORT_FORWARDS_LIST)
      rules.value = rows || []
    } finally {
      loading.value = false
    }
  }

  async function createRule(data: Partial<PortForward>): Promise<PortForward> {
    const plain = JSON.parse(JSON.stringify(data))
    const newRule = await invoke<PortForward>(IPC_DB.PORT_FORWARDS_CREATE, plain)
    if (newRule) rules.value.push(newRule)
    return newRule!
  }

  async function updateRule(id: string, data: Partial<PortForward>): Promise<void> {
    const plain = JSON.parse(JSON.stringify(data))
    const updated = await invoke<PortForward>(IPC_DB.PORT_FORWARDS_UPDATE, id, plain)
    if (updated) {
      const idx = rules.value.findIndex(r => r.id === id)
      if (idx !== -1) rules.value[idx] = updated
    }
  }

  async function deleteRule(id: string): Promise<void> {
    // 如果正在运行，先停止
    if (tunnelStates.value.has(id)) {
      await stopTunnel(id)
    }
    await invoke(IPC_DB.PORT_FORWARDS_DELETE, id)
    rules.value = rules.value.filter(r => r.id !== id)
    tunnelStates.value.delete(id)
  }

  // ===== 隧道控制 =====

  function findConnectionIdForHost(hostId: string): string | undefined {
    const sessionsStore = useSessionsStore()
    for (const inst of sessionsStore.terminalInstances.values()) {
      if (inst.type === 'ssh' && inst.hostId === hostId && inst.sshStatus === 'connected') {
        return inst.sshConnectionId
      }
    }
    return undefined
  }

  async function startTunnel(ruleId: string): Promise<{ success: boolean; error?: string }> {
    const rule = rules.value.find(r => r.id === ruleId)
    if (!rule) return { success: false, error: '规则不存在' }
    const connectionId = findConnectionIdForHost(rule.hostId)
    const result = await invoke<{ success: boolean; error?: string }>(
      IPC_PORT_FORWARD.START,
      { ruleId, connectionId }
    )
    return result || { success: false, error: '未知错误' }
  }

  async function stopTunnel(ruleId: string): Promise<void> {
    await invoke(IPC_PORT_FORWARD.STOP, { ruleId })
  }

  function getTunnelStatus(ruleId: string): TunnelState | undefined {
    return tunnelStates.value.get(ruleId)
  }

  // ===== 状态监听 =====

  function setupStatusListener(): void {
    on(IPC_PORT_FORWARD.STATUS, (data: unknown) => {
      const state = data as TunnelState
      const prev = tunnelStates.value.get(state.ruleId)
      if (state.status === 'inactive') {
        tunnelStates.value.delete(state.ruleId)
      } else {
        tunnelStates.value.set(state.ruleId, state)
      }
      if (state.status === 'error' && prev?.status !== 'error') {
        const rule = rules.value.find(r => r.id === state.ruleId)
        const name = rule?.name || `端口 ${rule?.localPort || rule?.remotePort || ''}`
        ElMessage.error(`端口转发 "${name}" 失败: ${state.error || '未知错误'}`)
      }
    })

    // 监听 SSH 连接成功，自动启动 autoStart 规则
    on(IPC_SSH.STATUS, (data: unknown) => {
      const { hostId, status } = data as { connectionId: string; hostId?: string; status: string }
      if (status !== 'connected' || !hostId) return
      for (const rule of rules.value) {
        if (rule.hostId === hostId && rule.autoStart && !tunnelStates.value.has(rule.id)) {
          startTunnel(rule.id)
        }
      }
    })
  }

  // ===== 初始化 =====

  async function init(): Promise<void> {
    setupStatusListener()
    await fetchRules()
    // 加载当前活跃的隧道状态
    const activeList = await invoke<TunnelState[]>(IPC_PORT_FORWARD.LIST_ACTIVE)
    if (activeList) {
      for (const state of activeList) {
        tunnelStates.value.set(state.ruleId, state)
      }
    }
  }

  return {
    rules,
    tunnelStates,
    loading,
    rulesByHost,
    activeRules,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    startTunnel,
    stopTunnel,
    getTunnelStatus,
    init,
  }
})
