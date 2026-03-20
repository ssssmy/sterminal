<template>
  <!-- 工具栏：SFTP / 分屏 / 广播 / 录制 / 搜索 / 全屏 -->
  <div class="app-toolbar">
    <!-- macOS 交通灯占位 -->
    <div class="app-toolbar__drag-region" />

    <!-- 左侧按钮组 -->
    <div class="app-toolbar__btn-group">
      <!-- SFTP 文件传输 -->
      <el-tooltip content="SFTP 文件传输" placement="bottom">
        <button
          class="app-toolbar__btn"
          :class="{ 'app-toolbar__btn--active': activeTool === 'sftp' }"
          @click="emit('sftp')"
        >
          <el-icon :size="16"><FolderOpened /></el-icon>
        </button>
      </el-tooltip>

      <!-- 水平分屏 -->
      <el-tooltip content="水平分屏" placement="bottom">
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
      <el-tooltip content="垂直分屏" placement="bottom">
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
      <el-tooltip content="广播模式（同步输入到所有终端）" placement="bottom">
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
      <el-tooltip content="录制会话" placement="bottom">
        <button
          class="app-toolbar__btn"
          :class="{ 'app-toolbar__btn--recording': isRecording }"
          @click="toggleRecording"
        >
          <el-icon :size="16"><VideoCamera /></el-icon>
        </button>
      </el-tooltip>

      <!-- 终端搜索 -->
      <el-tooltip content="终端内搜索" placement="bottom">
        <button
          class="app-toolbar__btn"
          :class="{ 'app-toolbar__btn--active': activeTool === 'search' }"
          @click="emit('terminal-search')"
        >
          <el-icon :size="16"><Search /></el-icon>
        </button>
      </el-tooltip>

      <!-- 全屏 -->
      <el-tooltip content="全屏" placement="bottom">
        <button
          class="app-toolbar__btn"
          @click="emit('fullscreen')"
        >
          <el-icon :size="16"><FullScreen /></el-icon>
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  FolderOpened, Microphone, VideoCamera,
  Search, FullScreen,
} from '@element-plus/icons-vue'

// ===== emits =====
const emit = defineEmits<{
  (e: 'sftp'): void
  (e: 'split-horizontal'): void
  (e: 'split-vertical'): void
  (e: 'broadcast', active: boolean): void
  (e: 'record', active: boolean): void
  (e: 'terminal-search'): void
  (e: 'fullscreen'): void
}>()

// ===== 本地状态 =====
const activeTool = ref<string | null>(null)
const broadcastMode = ref(false)
const isRecording = ref(false)

function toggleBroadcast(): void {
  broadcastMode.value = !broadcastMode.value
  emit('broadcast', broadcastMode.value)
}

function toggleRecording(): void {
  isRecording.value = !isRecording.value
  emit('record', isRecording.value)
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
