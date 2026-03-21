<template>
  <!-- 主工作区：侧边栏 + 工具栏 + 终端区域 -->
  <div class="workspace">
    <!-- 侧边栏 -->
    <AppSidebar
      :width="uiStore.sidebarWidth"
      :collapsed="uiStore.sidebarCollapsed"
    />

    <!-- 主内容区域 -->
    <div class="workspace__main">
      <!-- 顶部工具栏 -->
      <AppToolbar
        @sftp="handleSftp"
        @split-horizontal="handleSplitHorizontal"
        @split-vertical="handleSplitVertical"
        @broadcast="handleBroadcast"
        @terminal-search="handleTerminalSearch"
        @fullscreen="handleFullscreen"
      />

      <!-- 标签栏 + 终端区域 -->
      <div class="workspace__content">
        <!-- 无会话时显示欢迎页 -->
        <div v-if="sessionsStore.tabs.length === 0" class="workspace__empty">
          <div class="workspace__empty-inner">
            <p class="workspace__empty-hint">按 Ctrl+T 新建本地终端</p>
            <p class="workspace__empty-hint">或从左侧选择主机连接</p>
          </div>
        </div>

        <!-- 有会话时显示终端 -->
        <template v-else>
          <TerminalTabs />
          <div class="workspace__terminals">
            <TerminalPane
              v-for="tab in sessionsStore.tabs"
              :key="tab.id"
              v-show="sessionsStore.activeTabId === tab.id"
              :tab="tab"
              class="workspace__terminal-instance"
            />
            <!-- 终端内搜索栏 -->
            <TerminalSearchBar v-if="uiStore.showTerminalSearch" />
          </div>
        </template>
      </div>
    </div>

    <!-- 命令面板 -->
    <CommandPalette v-if="uiStore.showCommandPalette" />

    <!-- 主机配置对话框 -->
    <HostConfigDialog v-if="uiStore.showHostConfigDialog" />
    <!-- 终端配置对话框 -->
    <TerminalConfigDialog v-if="uiStore.showTerminalConfigDialog" />
    <!-- 片段编辑对话框 -->
    <SnippetEditDialog v-if="uiStore.showSnippetEditDialog" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WorkspaceView' })

import { defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUiStore } from '../../stores/ui.store'
import { useHostsStore } from '../../stores/hosts.store'
import { useTerminalsStore } from '../../stores/terminals.store'
import { useSnippetsStore } from '../../stores/snippets.store'
import AppSidebar from '../../components/sidebar/AppSidebar.vue'
import AppToolbar from '../../components/toolbar/AppToolbar.vue'
import TerminalTabs from '../../components/terminal/TerminalTabs.vue'
// 按需异步加载：仅在使用时才加载
const TerminalPane = defineAsyncComponent(() => import('../../components/terminal/TerminalPane.vue'))
const CommandPalette = defineAsyncComponent(() => import('../../components/common/CommandPalette.vue'))
const HostConfigDialog = defineAsyncComponent(() => import('../../components/host/HostConfigDialog.vue'))
const TerminalConfigDialog = defineAsyncComponent(() => import('../../components/terminal/TerminalConfigDialog.vue'))
const TerminalSearchBar = defineAsyncComponent(() => import('../../components/terminal/TerminalSearchBar.vue'))
const SnippetEditDialog = defineAsyncComponent(() => import('../../components/snippet/SnippetEditDialog.vue'))

const sessionsStore = useSessionsStore()
const uiStore = useUiStore()
const hostsStore = useHostsStore()
const terminalsStore = useTerminalsStore()
const snippetsStore = useSnippetsStore()

// ===== 工具栏事件处理 =====
function handleSftp(): void {
  // TODO: 打开 SFTP 文件传输面板
}

function handleSplitHorizontal(): void {
  if (!sessionsStore.activeTab) {
    sessionsStore.createTab()
    return
  }
  const root = sessionsStore.activeTab.root
  if (root.type === 'terminal') {
    sessionsStore.splitPane(sessionsStore.activeTab.id, root.terminalId, 'horizontal')
  }
}

function handleSplitVertical(): void {
  if (!sessionsStore.activeTab) {
    sessionsStore.createTab()
    return
  }
  const root = sessionsStore.activeTab.root
  if (root.type === 'terminal') {
    sessionsStore.splitPane(sessionsStore.activeTab.id, root.terminalId, 'vertical')
  }
}

function handleBroadcast(active: boolean): void {
  sessionsStore.broadcastMode = active
}

function handleTerminalSearch(): void {
  uiStore.showTerminalSearch = !uiStore.showTerminalSearch
}

function handleFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// ===== 键盘快捷键处理 =====
function handleKeydown(e: KeyboardEvent): void {
  // Ctrl+T: 新建标签页
  if (e.ctrlKey && e.key === 't') {
    e.preventDefault()
    sessionsStore.createTab()
  }
  // Ctrl+W: 关闭当前标签页
  if (e.ctrlKey && e.key === 'w' && sessionsStore.activeTabId) {
    e.preventDefault()
    sessionsStore.closeTab(sessionsStore.activeTabId)
  }
  // Ctrl+P / Cmd+P: 打开命令面板
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault()
    uiStore.openCommandPalette()
  }
  // Ctrl+F / Cmd+F: 终端内搜索
  if ((e.ctrlKey || e.metaKey) && e.key === 'f' && sessionsStore.activeTabId) {
    e.preventDefault()
    uiStore.showTerminalSearch = true
  }
}

onMounted(() => {
  // 加载主机列表和本地终端配置（不阻塞 UI 渲染）
  Promise.all([
    hostsStore.fetchHosts(),
    hostsStore.fetchGroups(),
    terminalsStore.fetchTerminals(),
    terminalsStore.fetchGroups(),
    snippetsStore.init(),
  ])

  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style lang="scss" scoped>
.workspace {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-primary);

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__terminals {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  &__terminal-instance {
    position: absolute;
    inset: 0;
  }

  &__empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
  }

  &__empty-inner {
    text-align: center;

    p {
      margin-bottom: 8px;
      font-size: 14px;
    }
  }
}
</style>
