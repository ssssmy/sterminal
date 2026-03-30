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
            <p class="workspace__empty-hint">{{ t('workspace.emptyHint1') }}</p>
            <p class="workspace__empty-hint">{{ t('workspace.emptyHint2') }}</p>
          </div>
        </div>

        <!-- 有会话时显示终端 -->
        <template v-else>
          <TerminalTabs />
          <div class="workspace__terminals">
            <template v-for="tab in sessionsStore.tabs" :key="tab.id">
              <!-- SFTP 面板 -->
              <SftpPanel
                v-if="tab.contentType === 'sftp'"
                v-show="sessionsStore.activeTabId === tab.id"
                :tab="tab"
                class="workspace__terminal-instance"
              />
              <!-- 终端面板 -->
              <TerminalPane
                v-else
                v-show="sessionsStore.activeTabId === tab.id"
                :tab="tab"
                class="workspace__terminal-instance"
              />
            </template>
            <!-- 终端内搜索栏 -->
            <TerminalSearchBar v-if="uiStore.showTerminalSearch" />
          </div>
        </template>
      </div>

      <!-- 更新通知栏 -->
      <UpdateNotification />
    </div>

    <!-- 命令面板 -->
    <CommandPalette v-if="uiStore.showCommandPalette" />

    <!-- 主机配置对话框 -->
    <HostConfigDialog v-if="uiStore.showHostConfigDialog" />
    <!-- 终端配置对话框 -->
    <TerminalConfigDialog v-if="uiStore.showTerminalConfigDialog" />
    <!-- 片段编辑对话框 -->
    <SnippetEditDialog v-if="uiStore.showSnippetEditDialog" />
    <!-- 端口转发对话框 -->
    <PortForwardDialog v-if="uiStore.showPortForwardDialog" />
    <!-- 片段变量填写对话框 -->
    <SnippetVariableDialog
      v-if="uiStore.executingSnippet"
      v-model="uiStore.showSnippetVariableDialog"
      :snippet-name="uiStore.executingSnippet.name"
      :snippet-content="uiStore.executingSnippet.content"
      :variables="executingSnippetVars"
      @confirm="handleSnippetVarConfirm"
      @cancel="uiStore.closeSnippetVariableDialog()"
    />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'WorkspaceView' })

import { defineAsyncComponent, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUiStore } from '../../stores/ui.store'
import { useHostsStore } from '../../stores/hosts.store'
import { useTerminalsStore } from '../../stores/terminals.store'
import { useSnippetsStore } from '../../stores/snippets.store'
import { usePortForwardsStore } from '../../stores/port-forwards.store'
import { parseVariables } from '@shared/utils/snippet-variables'
import { sendCommandToTerminal } from '../../components/terminal/TerminalPane.vue'
import { keybindingService } from '../../services/keybinding.service'
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
const PortForwardDialog = defineAsyncComponent(() => import('../../components/port-forward/PortForwardDialog.vue'))
const SnippetVariableDialog = defineAsyncComponent(() => import('../../components/snippet/SnippetVariableDialog.vue'))
const SftpPanel = defineAsyncComponent(() => import('../../components/sftp/SftpPanel.vue'))
const UpdateNotification = defineAsyncComponent(() => import('../../components/common/UpdateNotification.vue'))

const { t } = useI18n()
const sessionsStore = useSessionsStore()
const uiStore = useUiStore()
const hostsStore = useHostsStore()
const terminalsStore = useTerminalsStore()
const snippetsStore = useSnippetsStore()
const portForwardsStore = usePortForwardsStore()

// ===== 工具栏事件处理 =====
function handleSftp(): void {
  const ids = sessionsStore.getActiveTabTerminalIds()
  for (const id of ids) {
    const inst = sessionsStore.terminalInstances.get(id)
    if (inst?.type === 'ssh' && inst.sshStatus === 'connected' && inst.sshConnectionId && inst.hostId) {
      const host = hostsStore.hosts.find(h => h.id === inst.hostId)
      sessionsStore.createSftpTab(
        inst.hostId,
        host?.label || host?.address || 'SFTP',
        inst.sshConnectionId
      )
      return
    }
  }
  ElMessage.warning(t('sftp.noSshConnection'))
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

// ===== 片段变量执行 =====
const executingSnippetVars = computed(() => {
  const snippet = uiStore.executingSnippet
  if (!snippet) return []
  return parseVariables(snippet.content)
})

function handleSnippetVarConfirm(command: string): void {
  const terminalIds = sessionsStore.getActiveTabTerminalIds()
  if (terminalIds.length === 0) return
  sendCommandToTerminal(terminalIds[0], command)
  if (uiStore.executingSnippet) {
    snippetsStore.incrementUseCount(uiStore.executingSnippet.id)
  }
  uiStore.closeSnippetVariableDialog()
}

// ===== 键盘快捷键处理 =====
function handleKeydown(e: KeyboardEvent): void {
  keybindingService.handleKeyEvent(e)
}

onMounted(async () => {
  // 加载主机列表和本地终端配置（不阻塞 UI 渲染）
  Promise.all([
    hostsStore.fetchHosts(),
    hostsStore.fetchGroups(),
    terminalsStore.fetchTerminals(),
    terminalsStore.fetchGroups(),
    snippetsStore.init(),
    portForwardsStore.init(),
  ])

  // 加载自定义快捷键并注册默认动作
  await keybindingService.loadFromDb()
  keybindingService.register('new-tab', 'CmdOrCtrl+T', () => {
    sessionsStore.createTab()
  })
  keybindingService.register('close-tab', 'CmdOrCtrl+W', () => {
    if (sessionsStore.activeTabId) {
      sessionsStore.closeTab(sessionsStore.activeTabId)
    }
  })
  keybindingService.register('command-palette', 'CmdOrCtrl+P', () => {
    uiStore.openCommandPalette()
  })
  // Ctrl+K alias for command palette
  keybindingService.register('command-palette-alt', 'Ctrl+K', () => {
    uiStore.openCommandPalette()
  })
  keybindingService.register('terminal-search', 'CmdOrCtrl+F', () => {
    if (sessionsStore.activeTabId) {
      uiStore.showTerminalSearch = true
    }
  })

  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  keybindingService.unregister('new-tab')
  keybindingService.unregister('close-tab')
  keybindingService.unregister('command-palette')
  keybindingService.unregister('command-palette-alt')
  keybindingService.unregister('terminal-search')
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
