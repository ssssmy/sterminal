// 同步状态 Store
// 管理云同步状态和 E2EE 加密设置

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useIpc } from '../composables/useIpc'
import { IPC_SYNC } from '../../shared/types/ipc-channels'
import type { SyncStatus } from '../../shared/types/sync'

export type { SyncState, SyncStatus } from '../../shared/types/sync'

export const useSyncStore = defineStore('sync', () => {
  const { invoke, on } = useIpc()

  const status = ref<SyncStatus>({ state: 'stopped' })
  const hasEncryptionKey = ref(false)
  const encryptionSalt = ref<string | null>(null)

  const isSyncing = computed(() => status.value.state === 'syncing')
  const isActive = computed(() => status.value.state !== 'stopped')
  const lastSyncAt = computed(() => status.value.lastSyncAt)

  // 监听同步状态变化
  on<SyncStatus>(IPC_SYNC.STATUS_CHANGED, (newStatus) => {
    status.value = newStatus
  })

  async function startSync(token: string): Promise<void> {
    await invoke(IPC_SYNC.START, token)
    // Status will be set by the IPC_SYNC.STATUS_CHANGED event from the engine
  }

  async function stopSync(): Promise<void> {
    await invoke(IPC_SYNC.STOP)
    status.value = { state: 'stopped' }
    hasEncryptionKey.value = false
  }

  async function syncNow(): Promise<void> {
    await invoke(IPC_SYNC.SYNC_NOW)
  }

  async function refreshStatus(): Promise<void> {
    const s = await invoke<SyncStatus | null>(IPC_SYNC.STATUS)
    if (s) status.value = s
  }

  async function setEncryption(passphrase: string, salt?: string): Promise<void> {
    const result = await invoke<{ salt: string }>(IPC_SYNC.SET_ENCRYPTION, passphrase, salt)
    encryptionSalt.value = result.salt
    hasEncryptionKey.value = true
  }

  async function clearEncryption(): Promise<void> {
    await invoke(IPC_SYNC.CLEAR_ENCRYPTION)
    hasEncryptionKey.value = false
  }

  async function checkEncryption(): Promise<void> {
    hasEncryptionKey.value = await invoke<boolean>(IPC_SYNC.HAS_ENCRYPTION)
  }

  async function fetchSalt(): Promise<string | null> {
    const salt = await invoke<string | null>(IPC_SYNC.GET_SALT)
    encryptionSalt.value = salt
    return salt
  }

  async function setAutoSyncInterval(minutes: number): Promise<void> {
    await invoke(IPC_SYNC.SET_AUTO_INTERVAL, minutes)
  }

  return {
    status,
    hasEncryptionKey,
    encryptionSalt,
    isSyncing,
    isActive,
    lastSyncAt,
    startSync,
    stopSync,
    syncNow,
    refreshStatus,
    setEncryption,
    clearEncryption,
    checkEncryption,
    fetchSalt,
    setAutoSyncInterval,
  }
})
