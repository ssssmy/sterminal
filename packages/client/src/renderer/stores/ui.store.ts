// UI 状态 Store（侧边栏/主题/布局等界面状态）

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSettingsStore } from './settings.store'
import { IPC_WINDOW } from '@shared/types/ipc-channels'

export type AppTheme = 'light' | 'dark' | 'system'
export type SidebarPanel = 'hosts' | 'terminals' | 'snippets' | 'portForwards' | 'vault'

export const useUiStore = defineStore('ui', () => {
  // ===== 状态 =====
  const sidebarWidth = ref(260)
  const sidebarCollapsed = ref(false)
  const activePanel = ref<SidebarPanel>('hosts')
  const theme = ref<AppTheme>('dark')
  const showCommandPalette = ref(false)
  const showHostConfigDialog = ref(false)
  const editingHostId = ref<string | null>(null)
  const showTerminalConfigDialog = ref(false)
  const editingTerminalId = ref<string | null>(null)

  // ===== 主题操作 =====

  /**
   * 应用主题到 DOM
   */
  function applyTheme(newTheme: AppTheme): void {
    let resolvedTheme: 'light' | 'dark' = 'dark'

    if (newTheme === 'system') {
      resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } else {
      resolvedTheme = newTheme
    }

    document.documentElement.setAttribute('data-theme', resolvedTheme)
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')

    // Windows: 更新标题栏覆盖层颜色以跟随主题
    if (window.electronAPI?.platform === 'win32') {
      const overlay = resolvedTheme === 'dark'
        ? { color: '#1a1b2e', symbolColor: '#e2e8f0' }
        : { color: '#f0f1f3', symbolColor: '#374151' }
      window.electronAPI.ipc.invoke(IPC_WINDOW.SET_TITLE_BAR_OVERLAY, overlay)
    }
  }

  /**
   * 设置主题（持久化到数据库）
   */
  function setTheme(newTheme: AppTheme): void {
    theme.value = newTheme
    applyTheme(newTheme)
    const settingsStore = useSettingsStore()
    settingsStore.setSetting('app.theme', newTheme)
  }

  /**
   * 从数据库恢复主题设置
   */
  async function restoreTheme(): Promise<void> {
    const settingsStore = useSettingsStore()
    const saved = await settingsStore.getSetting<string>('app.theme')
    const themeValue = (saved || 'dark') as AppTheme
    theme.value = themeValue
    applyTheme(themeValue)
  }

  // 监听 theme 变化自动应用
  watch(theme, applyTheme, { immediate: false })

  // ===== 侧边栏操作 =====

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setSidebarWidth(width: number): void {
    sidebarWidth.value = Math.max(160, Math.min(480, width))
  }

  function setActivePanel(panel: SidebarPanel): void {
    activePanel.value = panel
  }

  // ===== 命令面板 =====

  function openCommandPalette(): void {
    showCommandPalette.value = true
  }

  function closeCommandPalette(): void {
    showCommandPalette.value = false
  }

  // ===== 主机配置对话框 =====

  function openHostConfigDialog(hostId?: string): void {
    editingHostId.value = hostId || null
    showHostConfigDialog.value = true
  }

  function closeHostConfigDialog(): void {
    showHostConfigDialog.value = false
    editingHostId.value = null
  }

  // ===== 终端配置对话框 =====

  function openTerminalConfigDialog(terminalId?: string): void {
    editingTerminalId.value = terminalId || null
    showTerminalConfigDialog.value = true
  }

  function closeTerminalConfigDialog(): void {
    showTerminalConfigDialog.value = false
    editingTerminalId.value = null
  }

  return {
    sidebarWidth,
    sidebarCollapsed,
    activePanel,
    theme,
    showCommandPalette,
    showHostConfigDialog,
    editingHostId,
    showTerminalConfigDialog,
    editingTerminalId,
    setTheme,
    restoreTheme,
    toggleSidebar,
    setSidebarWidth,
    setActivePanel,
    openCommandPalette,
    closeCommandPalette,
    openHostConfigDialog,
    closeHostConfigDialog,
    openTerminalConfigDialog,
    closeTerminalConfigDialog,
  }
})
