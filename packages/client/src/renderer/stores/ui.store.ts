// UI 状态 Store（侧边栏/主题/布局等界面状态）

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSettingsStore } from './settings.store'
import { useThemesStore } from './themes.store'
import { IPC_WINDOW } from '@shared/types/ipc-channels'
import type { Snippet } from '@shared/types/snippet'

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
  const showTerminalSearch = ref(false)
  const showSnippetEditDialog = ref(false)
  const editingSnippetId = ref<string | null>(null)

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

    // 应用自定义 CSS 覆盖（强调色等），与主题同步注入，避免 FOUC
    const themesStore = useThemesStore()
    const settingsStore = useSettingsStore()
    themesStore.applyCustomCssOverrides({
      '--accent': settingsStore.settings.get('app.accentColor') as string || '#6366f1',
    })
  }

  /**
   * 设置主题（持久化到数据库）
   */
  function setTheme(newTheme: AppTheme): void {
    theme.value = newTheme
    // applyTheme 由 watch(theme) 自动触发，无需手动调用
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
    // watch(theme) 仅在值变化时触发，初始化时需手动应用
    applyTheme(themeValue)
  }

  // 监听 theme 变化自动应用
  watch(theme, applyTheme, { immediate: false })

  // 监听系统主题切换，当 theme === 'system' 时自动跟随
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'system') {
        applyTheme('system')
      }
    })
  }

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

  // ===== 片段编辑对话框 =====

  function openSnippetEditDialog(snippetId?: string): void {
    editingSnippetId.value = snippetId || null
    showSnippetEditDialog.value = true
  }

  function closeSnippetEditDialog(): void {
    showSnippetEditDialog.value = false
    editingSnippetId.value = null
  }

  // ===== 片段变量对话框 =====
  const showSnippetVariableDialog = ref(false)
  const executingSnippet = ref<Snippet | null>(null)

  function openSnippetVariableDialog(snippet: Snippet): void {
    executingSnippet.value = snippet
    showSnippetVariableDialog.value = true
  }

  function closeSnippetVariableDialog(): void {
    showSnippetVariableDialog.value = false
    executingSnippet.value = null
  }

  // ===== 端口转发对话框 =====
  const showPortForwardDialog = ref(false)
  const editingPortForwardId = ref<string | null>(null)

  function openPortForwardDialog(portForwardId?: string): void {
    editingPortForwardId.value = portForwardId || null
    showPortForwardDialog.value = true
  }

  function closePortForwardDialog(): void {
    showPortForwardDialog.value = false
    editingPortForwardId.value = null
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
    showSnippetEditDialog,
    editingSnippetId,
    setTheme,
    restoreTheme,
    toggleSidebar,
    setSidebarWidth,
    setActivePanel,
    openCommandPalette,
    closeCommandPalette,
    openHostConfigDialog,
    closeHostConfigDialog,
    showTerminalSearch,
    openTerminalConfigDialog,
    closeTerminalConfigDialog,
    openSnippetEditDialog,
    closeSnippetEditDialog,
    showSnippetVariableDialog,
    executingSnippet,
    openSnippetVariableDialog,
    closeSnippetVariableDialog,
    showPortForwardDialog,
    editingPortForwardId,
    openPortForwardDialog,
    closePortForwardDialog,
  }
})
