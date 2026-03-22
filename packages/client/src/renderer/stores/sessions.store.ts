// 活跃会话 Store（标签页和分屏管理）

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { TabSession, SplitNode, TerminalInstance } from '@shared/types/terminal'
import { useTerminalsStore } from './terminals.store'

export const useSessionsStore = defineStore('sessions', () => {
  // ===== 状态 =====
  const tabs = ref<TabSession[]>([])
  const activeTabId = ref<string | null>(null)
  // 运行时终端实例（不持久化）
  const terminalInstances = ref<Map<string, TerminalInstance>>(new Map())
  // 广播模式：输入同步到当前 tab 下所有终端
  const broadcastMode = ref(false)

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

    // 本地终端未指定配置时，使用默认终端配置
    let resolvedConfigId = configId
    let resolvedLabel = label
    if (type === 'local' && !configId) {
      const terminalsStore = useTerminalsStore()
      const defaultConfig = terminalsStore.getDefault()
      if (defaultConfig) {
        resolvedConfigId = defaultConfig.id
        resolvedLabel = label || defaultConfig.name
      }
    }

    const instance: TerminalInstance = {
      id: terminalId,
      type,
      localConfigId: type === 'local' ? resolvedConfigId : undefined,
      hostId: type === 'ssh' ? configId : undefined,
      recording: false,
    }
    terminalInstances.value.set(terminalId, instance)

    const tab: TabSession = {
      id: tabId,
      label: resolvedLabel || (type === 'local' ? '本地终端' : '远程主机'),
      pinned: false,
      root: { type: 'terminal', terminalId },
    }

    tabs.value.push(tab)
    activeTabId.value = tabId

    return tab
  }

  /**
   * 创建 SFTP 标签页（不创建终端实例，只管理标签元信息）
   */
  function createSftpTab(hostId: string, label: string, connectionId: string): TabSession {
    const tabId = uuidv4()
    const tab: TabSession = {
      id: tabId,
      label: `SFTP: ${label}`,
      pinned: false,
      contentType: 'sftp',
      root: { type: 'terminal', terminalId: '' },
      sftpMeta: { connectionId, hostId, hostLabel: label },
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
   * 水平或垂直分屏（继承源终端的类型和配置）
   */
  function splitPane(
    tabId: string,
    terminalId: string,
    direction: 'horizontal' | 'vertical'
  ): string {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return ''

    const sourceInstance = terminalInstances.value.get(terminalId)
    const newTerminalId = uuidv4()
    const instance: TerminalInstance = {
      id: newTerminalId,
      type: sourceInstance?.type || 'local',
      localConfigId: sourceInstance?.localConfigId,
      hostId: sourceInstance?.hostId,
      recording: false,
    }
    terminalInstances.value.set(newTerminalId, instance)

    // 根节点是目标终端时需要替换 root；否则原地修改子树
    const newRoot = splitNodeInTree(tab.root, terminalId, direction, newTerminalId)
    if (newRoot !== tab.root) {
      tab.root = newRoot
    }

    return newTerminalId
  }

  /**
   * 关闭分屏中的某个终端面板，将其兄弟节点提升
   */
  function closeSplitPane(tabId: string, terminalId: string): void {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return

    // 如果根节点就是这个终端，不处理（整个标签页只有一个终端时用 closeTab）
    if (tab.root.type === 'terminal' && tab.root.terminalId === terminalId) return

    // 先删除实例记录，这样组件 unmount 时能判断出是"真正关闭"而非"分屏重组"
    terminalInstances.value.delete(terminalId)

    // 再修改树，触发 Vue 卸载组件
    const newRoot = removeNodeFromTree(tab.root, terminalId)
    if (newRoot) {
      tab.root = newRoot
    }
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
      if (node.terminalId) terminalInstances.value.delete(node.terminalId)
    } else {
      cleanupSplitNode(node.children[0])
      cleanupSplitNode(node.children[1])
    }
  }

  /**
   * 在分屏树中找到目标节点并分裂
   * 使用原地修改 split 节点的方式，避免重建整棵树导致已有终端组件被销毁
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
      // 原地修改 children，不创建新的 split 节点
      node.children[0] = splitNodeInTree(node.children[0], targetId, direction, newTerminalId)
      node.children[1] = splitNodeInTree(node.children[1], targetId, direction, newTerminalId)
      return node
    }
    return node
  }

  /**
   * 从分屏树中移除指定终端节点，返回修剪后的树
   */
  function removeNodeFromTree(node: SplitNode, targetId: string): SplitNode | null {
    if (node.type === 'terminal') {
      return node.terminalId === targetId ? null : node
    }
    // split 节点：检查两个子节点
    const left = node.children[0]
    const right = node.children[1]

    // 检查直接子节点是否是要移除的终端
    if (left.type === 'terminal' && left.terminalId === targetId) {
      return right // 提升右子节点
    }
    if (right.type === 'terminal' && right.terminalId === targetId) {
      return left // 提升左子节点
    }

    // 递归处理子树
    const newLeft = removeNodeFromTree(left, targetId)
    if (newLeft !== left) {
      // 目标在左子树中
      if (!newLeft) return right
      node.children[0] = newLeft
      return node
    }

    const newRight = removeNodeFromTree(right, targetId)
    if (newRight !== right) {
      // 目标在右子树中
      if (!newRight) return left
      node.children[1] = newRight
      return node
    }

    return node
  }

  /**
   * 关闭所有连接到指定主机的标签页
   */
  function closeTabsByHostId(hostId: string): void {
    const tabsToClose: string[] = []
    for (const tab of tabs.value) {
      const terminalIds = collectTerminalIds(tab.root)
      for (const tid of terminalIds) {
        const inst = terminalInstances.value.get(tid)
        if (inst?.type === 'ssh' && inst.hostId === hostId) {
          tabsToClose.push(tab.id)
          break
        }
      }
    }
    tabsToClose.forEach(id => closeTab(id))
  }

  /**
   * 递归收集分屏树中所有终端 ID
   */
  function collectTerminalIds(node: SplitNode): string[] {
    if (node.type === 'terminal') return [node.terminalId]
    return [...collectTerminalIds(node.children[0]), ...collectTerminalIds(node.children[1])]
  }

  /**
   * 获取当前活跃 tab 下所有终端 ID
   */
  function getActiveTabTerminalIds(): string[] {
    const tab = activeTab.value
    if (!tab) return []
    return collectTerminalIds(tab.root)
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    connectedHostIds,
    terminalInstances,
    broadcastMode,
    createTab,
    createSftpTab,
    closeTab,
    closeTabsByHostId,
    closeSplitPane,
    switchTab,
    renameTab,
    splitPane,
    togglePinTab,
    getActiveTabTerminalIds,
  }
})
