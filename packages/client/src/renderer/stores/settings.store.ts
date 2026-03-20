// 全局设置 Store

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useIpc } from '../composables/useIpc'
import { IPC_DB } from '@shared/types/ipc-channels'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'

export const useSettingsStore = defineStore('settings', () => {
  const { invoke } = useIpc()

  // ===== 状态 =====
  // 设置缓存（从数据库加载后存入）
  const settings = ref<Map<string, unknown>>(new Map())
  const loaded = ref(false)

  // ===== 操作 =====

  /**
   * 获取设置值（优先从缓存读取，否则查询数据库）
   */
  async function getSetting<T = unknown>(key: string): Promise<T> {
    if (settings.value.has(key)) {
      return settings.value.get(key) as T
    }
    const value = await invoke<T>(IPC_DB.SETTINGS_GET, key)
    const result = value ?? (DEFAULT_SETTINGS[key] as T)
    settings.value.set(key, result)
    return result
  }

  /**
   * 设置值（同时更新缓存和数据库）
   */
  async function setSetting(key: string, value: unknown): Promise<void> {
    settings.value.set(key, value)
    await invoke(IPC_DB.SETTINGS_SET, key, value)
  }

  /**
   * 批量加载常用设置到缓存
   */
  async function loadCommonSettings(): Promise<void> {
    if (loaded.value) return
    const keys = Object.keys(DEFAULT_SETTINGS)
    for (const key of keys) {
      await getSetting(key)
    }
    loaded.value = true
  }

  /**
   * 重置所有设置为默认值
   */
  async function resetAllSettings(): Promise<void> {
    await invoke(IPC_DB.SETTINGS_RESET)
    settings.value.clear()
    loaded.value = false
  }

  return {
    settings,
    loaded,
    getSetting,
    setSetting,
    loadCommonSettings,
    resetAllSettings,
  }
})
