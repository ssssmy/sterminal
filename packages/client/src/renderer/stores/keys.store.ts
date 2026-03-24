import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useIpc } from '../composables/useIpc'
import { IPC_DB, IPC_KEY } from '../../shared/types/ipc-channels'
import type { SshKey } from '../../shared/types/key'

export const useKeysStore = defineStore('keys', () => {
  const { invoke } = useIpc()

  const keys = ref<SshKey[]>([])
  const loading = ref(false)

  const keyOptions = computed(() =>
    keys.value.map(k => ({ id: k.id, label: `${k.name} (${k.keyType})` }))
  )

  async function fetchKeys(): Promise<void> {
    loading.value = true
    try {
      const rows = await invoke<SshKey[]>(IPC_DB.KEYS_LIST)
      keys.value = rows || []
    } finally {
      loading.value = false
    }
  }

  async function generateKey(params: {
    name: string
    keyType: 'ed25519' | 'rsa' | 'ecdsa'
    bits?: number
    curve?: string
    passphrase?: string
    comment?: string
  }): Promise<SshKey> {
    const key = await invoke<SshKey>(IPC_KEY.GENERATE, params)
    keys.value.unshift(key)
    return key
  }

  async function importKey(fileContent: string, name?: string, passphrase?: string): Promise<SshKey> {
    const key = await invoke<SshKey>(IPC_KEY.IMPORT, { fileContent, name, passphrase })
    keys.value.unshift(key)
    return key
  }

  async function deleteKey(id: string): Promise<void> {
    await invoke(IPC_DB.KEYS_DELETE, id)
    keys.value = keys.value.filter(k => k.id !== id)
  }

  async function updateKey(id: string, data: Partial<SshKey>): Promise<void> {
    const row = await invoke<SshKey>(IPC_DB.KEYS_UPDATE, id, data)
    if (row) {
      const idx = keys.value.findIndex(k => k.id === id)
      if (idx !== -1) keys.value[idx] = row
    }
  }

  async function deployKey(keyId: string, hostConfig: {
    hostId?: string; host: string; port: number; username: string; password?: string
  }): Promise<void> {
    await invoke(IPC_KEY.DEPLOY, { keyId, ...hostConfig })
  }

  return {
    keys,
    loading,
    keyOptions,
    fetchKeys,
    generateKey,
    importKey,
    deleteKey,
    updateKey,
    deployKey,
  }
})
