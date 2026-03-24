import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useIpc } from '../composables/useIpc'
import { IPC_DB, IPC_VAULT } from '../../shared/types/ipc-channels'
import type { VaultEntry, VaultConfig, VaultEntryType, PasswordGeneratorOptions } from '../../shared/types/vault'

export const useVaultStore = defineStore('vault', () => {
  const { invoke, on } = useIpc()

  const entries = ref<VaultEntry[]>([])
  const config = ref<VaultConfig>({ isSetup: false, isLocked: true, lockTimeout: 900 })
  const loading = ref(false)

  const isSetup = computed(() => config.value.isSetup)
  const isLocked = computed(() => config.value.isLocked)

  // 监听主进程自动锁定事件
  on(IPC_VAULT.LOCK, () => {
    config.value.isLocked = true
    entries.value = []
  })

  async function checkSetup(): Promise<void> {
    const result = await invoke<VaultConfig>(IPC_VAULT.UNLOCK, '__check_setup__')
      .catch(() => null)
    if (result) {
      config.value = result
    } else {
      // 检查 vault_config 是否存在
      const setup = await invoke<boolean>('vault:is-setup')
        .catch(() => false)
      config.value.isSetup = setup
    }
  }

  async function setup(masterPassword: string): Promise<void> {
    await invoke(IPC_VAULT.SETUP, masterPassword)
    config.value.isSetup = true
    config.value.isLocked = false
  }

  async function unlock(masterPassword: string): Promise<void> {
    await invoke(IPC_VAULT.UNLOCK, masterPassword)
    config.value.isLocked = false
    await fetchEntries()
  }

  async function lock(): Promise<void> {
    await invoke(IPC_VAULT.LOCK)
    config.value.isLocked = true
    entries.value = []
  }

  async function fetchEntries(): Promise<void> {
    if (config.value.isLocked) return
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
    config,
    loading,
    isSetup,
    isLocked,
    checkSetup,
    setup,
    unlock,
    lock,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    generatePassword,
  }
})
