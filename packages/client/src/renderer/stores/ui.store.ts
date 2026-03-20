// UI 状态 Store（侧边栏/主题/布局等界面状态）

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

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

  // ===== 主题操作 =====

  /**
   * 应用主题到 DOM
   */
  function applyTheme(newTheme: AppTheme): void {
    let resolvedTheme: 'light' | 'dark' = 'dark'

    if (newTheme === 'system') {
      // 跟随系统主题
      resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } else {
      resolvedTheme = newTheme
    }

    document.documentElement.setAttribute('data-theme', resolvedTheme)
    // Element Plus 暗色主题需要 html.dark class
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }

  /**
   * 设置主题
   */
  function setTheme(newTheme: AppTheme): void {
    theme.value = newTheme
    applyTheme(newTheme)
    localStorage.setItem('app_theme', newTheme)
  }

  /**
   * 从本地存储恢复主题设置
   */
  function restoreTheme(): void {
    const saved = localStorage.getItem('app_theme') as AppTheme | null
    setTheme(saved || 'dark')
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

  return {
    sidebarWidth,
    sidebarCollapsed,
    activePanel,
    theme,
    showCommandPalette,
    showHostConfigDialog,
    editingHostId,
    setTheme,
    restoreTheme,
    toggleSidebar,
    setSidebarWidth,
    setActivePanel,
    openCommandPalette,
    closeCommandPalette,
    openHostConfigDialog,
    closeHostConfigDialog,
  }
})
