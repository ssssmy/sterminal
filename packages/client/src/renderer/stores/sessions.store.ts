// 活跃会话 Store（标签页和分屏管理）

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { TabSession, SplitNode, TerminalInstance } from '@shared/types/terminal'

export const useSessionsStore = defineStore('sessions', () => {
  // ===== 状态 =====
  const tabs = ref<TabSession[]>([])
  const activeTabId = ref<string | null>(null)
  // 运行时终端实例（不持久化）
  const terminalInstances = ref<Map<string, TerminalInstance>>(new Map())

  // ===== 计算属性 =====
  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value) ?? null
  )

  /** 当前已连接的主机 ID 集合 */
  const connectedHostIds = computed(() => {
    const ids = new Set<string>()
    for (const instance of terminalInstances.value.values()) {
      if (instance.type === 'ssh' && instance.hostId && instance.sshStatus === 'connected') {
        ids.add(instance.hostId)
      }
    }
    return ids
  })

  // ===== 操作 =====

  /**
   * 创建新标签页（默认打开一个本地终端）
   */
  function createTab(label?: string, type: 'local' | 'ssh' = 'local', configId?: string): TabSession {
    const terminalId = uuidv4()
    const tabId = uuidv4()

    const instance: TerminalInstance = {
      id: terminalId,
      type,
      localConfigId: type === 'local' ? configId : undefined,
      hostId: type === 'ssh' ? configId : undefined,
      recording: false,
    }
    terminalInstances.value.set(terminalId, instance)

    const tab: TabSession = {
      id: tabId,
      label: label || (type === 'local' ? '本地终端' : '远程主机'),
      pinned: false,
      root: { type: 'terminal', terminalId },
    }

    tabs.value.push(tab)
    activeTabId.value = tabId

    return tab
  }

  /**
   * 关闭标签页
   */
  function closeTab(tabId: string): void {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return

    // 清理该标签页下所有终端实例
    const tab = tabs.value[idx]
    cleanupSplitNode(tab.root)

    tabs.value.splice(idx, 1)

    // 切换到相邻标签页
    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        activeTabId.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id
      } else {
        activeTabId.value = null
      }
    }
  }

  /**
   * 切换活跃标签页
   */
  function switchTab(tabId: string): void {
    if (tabs.value.some(t => t.id === tabId)) {
      activeTabId.value = tabId
    }
  }

  /**
   * 水平或垂直分屏
   */
  function splitPane(
    tabId: string,
    terminalId: string,
    direction: 'horizontal' | 'vertical'
  ): string {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return ''

    const newTerminalId = uuidv4()
    const instance: TerminalInstance = {
      id: newTerminalId,
      type: 'local',
      recording: false,
    }
    terminalInstances.value.set(newTerminalId, instance)

    // 找到目标节点并替换为分屏节点
    tab.root = splitNodeInTree(tab.root, terminalId, direction, newTerminalId)

    return newTerminalId
  }

  /**
   * 重命名标签页
   */
  function renameTab(tabId: string, newLabel: string): void {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab && newLabel.trim()) {
      tab.label = newLabel.trim()
    }
  }

  /**
   * 固定/取消固定标签页
   */
  function togglePinTab(tabId: string): void {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) tab.pinned = !tab.pinned
  }

  /**
   * 递归清理分屏树中的终端实例
   */
  function cleanupSplitNode(node: SplitNode): void {
    if (node.type === 'terminal') {
      terminalInstances.value.delete(node.terminalId)
    } else {
      cleanupSplitNode(node.children[0])
      cleanupSplitNode(node.children[1])
    }
  }

  /**
   * 在分屏树中找到目标节点并分裂
   */
  function splitNodeInTree(
    node: SplitNode,
    targetId: string,
    direction: 'horizontal' | 'vertical',
    newTerminalId: string
  ): SplitNode {
    if (node.type === 'terminal' && node.terminalId === targetId) {
      return {
        type: 'split',
        direction,
        ratio: 0.5,
        children: [
          { type: 'terminal', terminalId: targetId },
          { type: 'terminal', terminalId: newTerminalId },
        ],
      }
    }
    if (node.type === 'split') {
      return {
        ...node,
        children: [
          splitNodeInTree(node.children[0], targetId, direction, newTerminalId),
          splitNodeInTree(node.children[1], targetId, direction, newTerminalId),
        ],
      }
    }
    return node
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    connectedHostIds,
    terminalInstances,
    createTab,
    closeTab,
    switchTab,
    renameTab,
    splitPane,
    togglePinTab,
  }
})
