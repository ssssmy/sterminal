import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useIpc } from '../composables/useIpc'
import { IPC_DB, IPC_VAULT } from '../../shared/types/ipc-channels'
import type { VaultEntry, PasswordGeneratorOptions } from '../../shared/types/vault'

export const useVaultStore = defineStore('vault', () => {
  const { invoke } = useIpc()

  const entries = ref<VaultEntry[]>([])
  const loading = ref(false)

  async function fetchEntries(): Promise<void> {
    loading.value = true
    try {
      const rows = await invoke<VaultEntry[]>(IPC_DB.VAULT_LIST)
      entries.value = rows || []
    } finally {
      loading.value = false
    }
  }

  async function createEntry(data: Partial<VaultEntry>): Promise<VaultEntry | null> {
    const row = await invoke<VaultEntry>(IPC_DB.VAULT_CREATE, data)
    if (row) entries.value.push(row)
    return row
  }

  async function updateEntry(id: string, data: Partial<VaultEntry>): Promise<void> {
    const row = await invoke<VaultEntry>(IPC_DB.VAULT_UPDATE, id, data)
    if (row) {
      const idx = entries.value.findIndex(e => e.id === id)
      if (idx !== -1) entries.value[idx] = row
    }
  }

  async function deleteEntry(id: string): Promise<void> {
    await invoke(IPC_DB.VAULT_DELETE, id)
    entries.value = entries.value.filter(e => e.id !== id)
  }

  async function generatePassword(options: PasswordGeneratorOptions): Promise<string> {
    return await invoke<string>(IPC_VAULT.GENERATE_PASSWORD, options)
  }

  return {
    entries,
    loading,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    generatePassword,
  }
})
