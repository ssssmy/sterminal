// 命令片段 Store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Snippet, SnippetGroup } from '@shared/types/snippet'
import { useIpc } from '../composables/useIpc'
import { IPC_DB } from '@shared/types/ipc-channels'

export const useSnippetsStore = defineStore('snippets', () => {
  const { invoke } = useIpc()

  // ===== 状态 =====
  const snippets = ref<Snippet[]>([])
  const groups = ref<SnippetGroup[]>([])
  const loading = ref(false)

  // ===== 计算属性 =====

  /** 按分组组织的片段 Map（每组内按 sortOrder 排序） */
  const snippetsByGroup = computed(() => {
    const map = new Map<string | null, Snippet[]>()
    const sorted = [...snippets.value].sort((a, b) => a.sortOrder - b.sortOrder)
    for (const s of sorted) {
      const key = s.groupId || null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return map
  })

  /** 未分组的片段 */
  const ungroupedSnippets = computed(() => snippetsByGroup.value.get(null) || [])

  // ===== 片段操作 =====

  async function fetchSnippets(): Promise<void> {
    loading.value = true
    try {
      const rows = await invoke<Snippet[]>(IPC_DB.SNIPPETS_LIST)
      snippets.value = rows || []
    } finally {
      loading.value = false
    }
  }

  async function createSnippet(data: Partial<Snippet>): Promise<Snippet> {
    const plain = JSON.parse(JSON.stringify(data))
    const newSnippet = await invoke<Snippet>(IPC_DB.SNIPPETS_CREATE, plain)
    if (newSnippet) snippets.value.push(newSnippet)
    return newSnippet!
  }

  async function updateSnippet(id: string, data: Partial<Snippet>): Promise<void> {
    const plain = JSON.parse(JSON.stringify(data))
    const updated = await invoke<Snippet>(IPC_DB.SNIPPETS_UPDATE, id, plain)
    if (updated) {
      const idx = snippets.value.findIndex(s => s.id === id)
      if (idx !== -1) snippets.value[idx] = updated
    }
  }

  async function deleteSnippet(id: string): Promise<void> {
    await invoke(IPC_DB.SNIPPETS_DELETE, id)
    snippets.value = snippets.value.filter(s => s.id !== id)
  }

  async function incrementUseCount(id: string): Promise<void> {
    const result = await invoke<{ useCount: number; lastUsedAt: string }>(IPC_DB.SNIPPETS_INCREMENT_USE, id)
    if (result) {
      const idx = snippets.value.findIndex(s => s.id === id)
      if (idx !== -1) {
        snippets.value[idx].useCount = result.useCount
        snippets.value[idx].lastUsedAt = result.lastUsedAt
      }
    }
  }

  // ===== 分组操作 =====

  async function fetchGroups(): Promise<void> {
    const rows = await invoke<SnippetGroup[]>(IPC_DB.SNIPPET_GROUPS_LIST)
    groups.value = rows || []
  }

  async function createGroup(data: Partial<SnippetGroup>): Promise<SnippetGroup> {
    const newGroup = await invoke<SnippetGroup>(IPC_DB.SNIPPET_GROUPS_CREATE, data)
    if (newGroup) groups.value.push(newGroup)
    return newGroup!
  }

  async function updateGroup(id: string, data: Partial<SnippetGroup>): Promise<void> {
    const updated = await invoke<SnippetGroup>(IPC_DB.SNIPPET_GROUPS_UPDATE, id, data)
    if (updated) {
      const idx = groups.value.findIndex(g => g.id === id)
      if (idx !== -1) groups.value[idx] = updated
    }
  }

  async function deleteGroup(id: string): Promise<void> {
    await invoke(IPC_DB.SNIPPET_GROUPS_DELETE, id)
    groups.value = groups.value.filter(g => g.id !== id)
    // 将该分组下的片段移到未分组（后端已处理，前端同步）
    for (const s of snippets.value) {
      if (s.groupId === id) s.groupId = undefined
    }
  }

  // ===== 拖拽移动 =====

  async function moveSnippet(snippetId: string, targetGroupId: string | null, targetIndex: number): Promise<void> {
    const snippet = snippets.value.find(s => s.id === snippetId)
    if (!snippet) return

    const siblings = snippets.value
      .filter(s => (s.groupId || null) === targetGroupId && s.id !== snippetId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    siblings.splice(targetIndex, 0, snippet)

    const newGroupId = targetGroupId || undefined
    snippet.groupId = newGroupId

    const updates: Promise<unknown>[] = []
    for (let i = 0; i < siblings.length; i++) {
      const s = siblings[i]
      const oldOrder = s.sortOrder
      s.sortOrder = i
      if (s.id === snippetId) {
        updates.push(invoke(IPC_DB.SNIPPETS_UPDATE, s.id, { groupId: newGroupId, sortOrder: i }))
      } else if (oldOrder !== i) {
        updates.push(invoke(IPC_DB.SNIPPETS_UPDATE, s.id, { sortOrder: i }))
      }
    }
    await Promise.all(updates)
  }

  // ===== 初始化 =====

  async function init(): Promise<void> {
    await Promise.all([fetchSnippets(), fetchGroups()])
  }

  return {
    snippets,
    groups,
    loading,
    snippetsByGroup,
    ungroupedSnippets,
    fetchSnippets,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    incrementUseCount,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    moveSnippet,
    init,
  }
})
