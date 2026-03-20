// 命令片段 Store

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Snippet, SnippetGroup } from '@shared/types/snippet'
import { useIpc } from '../composables/useIpc'
import { IPC_DB } from '@shared/types/ipc-channels'

export const useSnippetsStore = defineStore('snippets', () => {
  const { invoke } = useIpc()

  // ===== 状态 =====
  const snippets = ref<Snippet[]>([])
  const groups = ref<SnippetGroup[]>([])
  const loading = ref(false)

  // ===== 操作 =====

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
    const newSnippet = await invoke<Snippet>(IPC_DB.SNIPPETS_CREATE, data)
    if (newSnippet) snippets.value.push(newSnippet)
    return newSnippet!
  }

  async function updateSnippet(id: string, data: Partial<Snippet>): Promise<void> {
    const updated = await invoke<Snippet>(IPC_DB.SNIPPETS_UPDATE, id, data)
    if (updated) {
      const idx = snippets.value.findIndex(s => s.id === id)
      if (idx !== -1) snippets.value[idx] = updated
    }
  }

  async function deleteSnippet(id: string): Promise<void> {
    await invoke(IPC_DB.SNIPPETS_DELETE, id)
    snippets.value = snippets.value.filter(s => s.id !== id)
  }

  return {
    snippets,
    groups,
    loading,
    fetchSnippets,
    createSnippet,
    updateSnippet,
    deleteSnippet,
  }
})
