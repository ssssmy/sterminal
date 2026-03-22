<template>
  <!-- 工具栏：SFTP / 分屏 / 广播 / 录制 / 搜索 / 全屏 -->
  <div class="app-toolbar" :class="{ 'app-toolbar--windows': isWindows }">
    <!-- macOS 交通灯占位（仅 macOS 显示） -->
    <div v-if="isMacOS" class="app-toolbar__drag-region" />

    <!-- 左侧按钮组 -->
    <div class="app-toolbar__btn-group">
      <!-- 新建终端 -->
      <el-tooltip :content="t('toolbar.newTerminal')" placement="bottom">
        <button
          class="app-toolbar__btn"
          @click="openDefaultTerminal"
        >
          <el-icon :size="16"><Cpu /></el-icon>
        </button>
      </el-tooltip>

      <!-- SFTP 文件传输 -->
      <el-tooltip :content="t('toolbar.sftp')" placement="bottom">
        <button
          class="app-toolbar__btn"
          :class="{ 'app-toolbar__btn--active': activeTool === 'sftp' }"
          @click="emit('sftp')"
        >
          <el-icon :size="16"><FolderOpened /></el-icon>
        </button>
      </el-tooltip>

      <!-- 水平分屏 -->
      <el-tooltip :content="t('toolbar.splitHorizontal')" placement="bottom">
        <button
          class="app-toolbar__btn"
          @click="emit('split-horizontal')"
        >
          <!-- 水平分屏图标（上下两块）-->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="5" rx="1" fill="currentColor" opacity="0.8"/>
            <rect x="2" y="9" width="12" height="5" rx="1" fill="currentColor" opacity="0.8"/>
          </svg>
        </button>
      </el-tooltip>

      <!-- 垂直分屏 -->
      <el-tooltip :content="t('toolbar.splitVertical')" placement="bottom">
        <button
          class="app-toolbar__btn"
          @click="emit('split-vertical')"
        >
          <!-- 垂直分屏图标（左右两块）-->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="5" height="12" rx="1" fill="currentColor" opacity="0.8"/>
            <rect x="9" y="2" width="5" height="12" rx="1" fill="currentColor" opacity="0.8"/>
          </svg>
        </button>
      </el-tooltip>

      <!-- 广播模式 -->
      <el-tooltip :content="t('toolbar.broadcast')" placement="bottom">
        <button
          class="app-toolbar__btn"
          :class="{ 'app-toolbar__btn--active': broadcastMode }"
          @click="toggleBroadcast"
        >
          <el-icon :size="16"><Microphone /></el-icon>
        </button>
      </el-tooltip>
    </div>

    <!-- 中间弹性区 (可拖拽) -->
    <div class="app-toolbar__spacer" />

    <!-- 右侧按钮组 -->
    <div class="app-toolbar__btn-group">
      <!-- 录制会话 -->
      <el-tooltip :content="isRecording ? t('toolbar.stopRecording') : t('toolbar.startRecording')" placement="bottom">
        <button
          class="app-toolbar__btn"
          :class="{ 'app-toolbar__btn--recording': isRecording }"
          :disabled="!sessionsStore.activeTab"
          @click="toggleRecording"
        >
          <el-icon :size="16"><VideoCamera /></el-icon>
        </button>
      </el-tooltip>

      <!-- 录制文件夹 -->
      <el-tooltip :content="t('toolbar.openLogDir')" placement="bottom">
        <button
          class="app-toolbar__btn"
          @click="openLogDirectory"
        >
          <el-icon :size="16"><Folder /></el-icon>
        </button>
      </el-tooltip>

      <!-- 终端搜索 -->
      <el-tooltip :content="t('toolbar.terminalSearch')" placement="bottom">
        <button
          class="app-toolbar__btn"
          :class="{ 'app-toolbar__btn--active': activeTool === 'search' }"
          @click="emit('terminal-search')"
        >
          <el-icon :size="16"><Search /></el-icon>
        </button>
      </el-tooltip>

      <!-- 全屏 -->
      <el-tooltip :content="t('toolbar.fullscreen')" placement="bottom">
        <button
          class="app-toolbar__btn"
          @click="emit('fullscreen')"
        >
          <el-icon :size="16"><FullScreen /></el-icon>
        </button>
      </el-tooltip>
    </div>

    <!-- Windows 窗口控制按钮占位（titleBarOverlay 在此区域显示原生按钮） -->
    <div v-if="isWindows" class="app-toolbar__win-controls-spacer" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  FolderOpened, Microphone, VideoCamera,
  Search, FullScreen, Cpu, Folder,
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSessionsStore } from '../../stores/sessions.store'
import { useTerminalsStore } from '../../stores/terminals.store'
import { IPC_LOG } from '@shared/types/ipc-channels'

const { t } = useI18n()

const isMacOS = window.electronAPI?.platform === 'darwin'
const isWindows = window.electronAPI?.platform === 'win32'
const sessionsStore = useSessionsStore()
const terminalsStore = useTerminalsStore()
const ipc = window.electronAPI?.ipc

// 广播模式与 store 同步
const broadcastMode = computed(() => sessionsStore.broadcastMode)

// 当前 tab 下是否有终端在录制
const isRecording = computed(() => {
  const tab = sessionsStore.activeTab
  if (!tab) return false
  const ids = sessionsStore.getActiveTabTerminalIds()
  return ids.some(id => {
    const inst = sessionsStore.terminalInstances.get(id)
    return inst?.recording
  })
})

// ===== emits =====
const emit = defineEmits<{
  (e: 'sftp'): void
  (e: 'split-horizontal'): void
  (e: 'split-vertical'): void
  (e: 'broadcast', active: boolean): void
  (e: 'terminal-search'): void
  (e: 'fullscreen'): void
}>()

// ===== 本地状态 =====
const activeTool = ref<string | null>(null)

function toggleBroadcast(): void {
  sessionsStore.broadcastMode = !sessionsStore.broadcastMode
}

async function toggleRecording(): Promise<void> {
  const tab = sessionsStore.activeTab
  if (!tab || !ipc) return

  const terminalIds = sessionsStore.getActiveTabTerminalIds()
  const shouldStart = !isRecording.value

  for (const tid of terminalIds) {
    const inst = sessionsStore.terminalInstances.get(tid)
    if (!inst) continue

    const terminalKey = inst.sshConnectionId || inst.ptyId
    if (!terminalKey) continue

    if (shouldStart && !inst.recording) {
      await ipc.invoke(IPC_LOG.START, {
        terminalKey,
        cols: 80,
        rows: 24,
        label: tab.label,
        hostId: inst.hostId,
        localTerminalId: inst.localConfigId,
      })
      inst.recording = true
    } else if (!shouldStart && inst.recording) {
      await ipc.invoke(IPC_LOG.STOP, { terminalKey })
      inst.recording = false
    }
  }
}

function openLogDirectory(): void {
  ipc?.invoke(IPC_LOG.OPEN_DIRECTORY)
}

function openDefaultTerminal(): void {
  const defaultTerminal = terminalsStore.getDefault()
  if (defaultTerminal) {
    sessionsStore.createTab(defaultTerminal.name, 'local', defaultTerminal.id)
  } else {
    sessionsStore.createTab()
  }
}
</script>

<style lang="scss" scoped>
.app-toolbar {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  gap: 8px;
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--divider);
  flex-shrink: 0;
  // 允许 Electron 窗口拖拽
  -webkit-app-region: drag;

  // 非拖拽区域
  button,
  svg,
  .el-tooltip {
    -webkit-app-region: no-drag;
  }

  &__drag-region {
    // macOS 交通灯按钮占位
    width: 72px;
    height: 100%;
    flex-shrink: 0;
  }

  // Windows 原生窗口控制按钮占位（最小化/最大化/关闭）
  &__win-controls-spacer {
    width: 138px;
    height: 100%;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
  }

  // Windows 模式：不需要左侧交通灯占位
  &--windows {
    padding-left: 12px;
  }

  &__btn-group {
    display: flex;
    align-items: center;
    gap: 2px;
    -webkit-app-region: no-drag;
  }

  &__spacer {
    flex: 1;
  }

  &__btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
    -webkit-app-region: no-drag;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    // 激活状态（如 SFTP 面板打开时）
    &--active {
      background-color: var(--bg-hover);
      color: var(--accent);
    }

    // 录制中状态（红色闪烁）
    &--recording {
      color: var(--error);

      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      animation: blink 1.2s ease-in-out infinite;
    }
  }
}
</style>
