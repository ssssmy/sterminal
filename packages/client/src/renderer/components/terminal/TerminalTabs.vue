<template>
  <!-- 终端标签栏：标签列表 + 滚动箭头 + 新建按钮 -->
  <div class="terminal-tabs">
    <!-- 左侧滚动箭头（溢出时显示）-->
    <button
      v-show="showScrollLeft"
      class="terminal-tabs__scroll-btn terminal-tabs__scroll-btn--left"
      @click="scrollBy(-120)"
    >
      <el-icon :size="12"><ArrowLeft /></el-icon>
    </button>

    <!-- 标签列表可滚动区域 -->
    <div
      ref="scrollContainerRef"
      class="terminal-tabs__scroll"
      @scroll="checkScrollState"
      @wheel.prevent="handleWheel"
    >
      <div
        v-for="tab in sessionsStore.tabs"
        :key="tab.id"
        class="terminal-tabs__tab"
        :class="{ 'terminal-tabs__tab--active': sessionsStore.activeTabId === tab.id }"
        :title="tab.label"
        @click="sessionsStore.switchTab(tab.id)"
        @dblclick="startRename(tab.id, tab.label)"
      >
        <!-- 类型图标：SSH 用连接图标，本地用终端图标 -->
        <el-icon :size="13" class="terminal-tabs__type-icon">
          <component :is="getTabIcon(tab)" />
        </el-icon>

        <!-- 标签名：正常显示或内联编辑 -->
        <template v-if="renamingTabId === tab.id">
          <input
            ref="renameInputRef"
            v-model="renameValue"
            class="terminal-tabs__rename-input"
            @keyup.enter="commitRename"
            @keyup.escape="cancelRename"
            @blur="commitRename"
            @click.stop
          />
        </template>
        <span v-else class="terminal-tabs__label">{{ tab.label }}</span>

        <!-- 录制指示器 -->
        <span v-if="isTabRecording(tab)" class="terminal-tabs__rec-dot" title="录制中" />

        <!-- 固定图标 -->
        <el-icon v-if="tab.pinned" :size="11" class="terminal-tabs__pin">
          <Star />
        </el-icon>

        <!-- 关闭按钮（未固定时显示）-->
        <button
          v-if="!tab.pinned"
          class="terminal-tabs__close"
          @click.stop="sessionsStore.closeTab(tab.id)"
        >
          <el-icon :size="11"><Close /></el-icon>
        </button>
      </div>
    </div>

    <!-- 右侧滚动箭头 -->
    <button
      v-show="showScrollRight"
      class="terminal-tabs__scroll-btn terminal-tabs__scroll-btn--right"
      @click="scrollBy(120)"
    >
      <el-icon :size="12"><ArrowRight /></el-icon>
    </button>

    <!-- 新建标签页按钮 -->
    <button class="terminal-tabs__new-btn" @click="sessionsStore.createTab()">
      <el-icon :size="14"><Plus /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, watch, type Component } from 'vue'
import { Star, Close, Plus, ArrowLeft, ArrowRight, Monitor, Connection } from '@element-plus/icons-vue'
import { useSessionsStore } from '../../stores/sessions.store'
import type { TabSession } from '@shared/types/terminal'
import IconMacOS from '../icons/IconMacOS.vue'
import IconWindows from '../icons/IconWindows.vue'
import IconLinux from '../icons/IconLinux.vue'

const sessionsStore = useSessionsStore()

// ===== 滚动状态 =====
const scrollContainerRef = ref<HTMLElement | null>(null)
const showScrollLeft = ref(false)
const showScrollRight = ref(false)

function checkScrollState(): void {
  const el = scrollContainerRef.value
  if (!el) return
  showScrollLeft.value = el.scrollLeft > 0
  showScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollBy(delta: number): void {
  scrollContainerRef.value?.scrollBy({ left: delta, behavior: 'smooth' })
}

function handleWheel(e: WheelEvent): void {
  scrollContainerRef.value?.scrollBy({ left: e.deltaY })
}

// ===== 内联重命名 =====
const renamingTabId = ref<string | null>(null)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function startRename(tabId: string, currentLabel: string): void {
  renamingTabId.value = tabId
  renameValue.value = currentLabel
  nextTick(() => {
    renameInputRef.value?.select()
  })
}

function commitRename(): void {
  if (renamingTabId.value && renameValue.value.trim()) {
    sessionsStore.renameTab(renamingTabId.value, renameValue.value)
  }
  renamingTabId.value = null
  renameValue.value = ''
}

function cancelRename(): void {
  renamingTabId.value = null
  renameValue.value = ''
}

// ===== 检查标签页是否在录制 =====
function isTabRecording(tab: TabSession): boolean {
  function checkNode(node: typeof tab.root): boolean {
    if (node.type === 'terminal') {
      const inst = sessionsStore.terminalInstances.get(node.terminalId)
      return inst?.recording === true
    }
    return checkNode(node.children[0]) || checkNode(node.children[1])
  }
  return checkNode(tab.root)
}

// ===== 标签图标：SSH 连接成功后按远端 OS 显示，否则按类型显示 =====
function getTabIcon(tab: TabSession): Component {
  const root = tab.root
  if (root.type === 'terminal') {
    const instance = sessionsStore.terminalInstances.get(root.terminalId)
    if (instance?.type === 'ssh') {
      if (instance.remoteOS === 'darwin') return IconMacOS
      if (instance.remoteOS === 'windows') return IconWindows
      if (instance.remoteOS === 'linux') return IconLinux
      return Connection
    }
  }
  return Monitor
}

// 标签数量变化时刷新滚动状态，并自动滚动到活跃标签
watch(
  () => sessionsStore.tabs.length,
  () => nextTick(checkScrollState),
)

onMounted(() => {
  nextTick(checkScrollState)
})
</script>

<style lang="scss" scoped>
.terminal-tabs {
  display: flex;
  align-items: center;
  height: var(--tab-height);
  background-color: var(--tab-bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  overflow: hidden;

  // ===== 滚动箭头 =====
  &__scroll-btn {
    width: 24px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-right: 1px solid var(--divider);
    background: var(--tab-bg);
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    z-index: 1;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    &--right {
      border-right: none;
      border-left: 1px solid var(--divider);
    }
  }

  // ===== 标签滚动容器 =====
  &__scroll {
    flex: 1;
    display: flex;
    align-items: stretch;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;

    // 隐藏滚动条
    &::-webkit-scrollbar {
      height: 0;
    }
  }

  // ===== 单个标签 =====
  &__tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 12px;
    height: 100%;
    min-width: 100px;
    max-width: 200px;
    cursor: pointer;
    border-right: 1px solid var(--divider);
    color: var(--text-secondary);
    font-size: 12px;
    transition: background-color 0.15s;
    flex-shrink: 0;
    position: relative;
    user-select: none;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);

      .terminal-tabs__close {
        opacity: 1;
      }
    }

    &--active {
      background-color: var(--tab-active-bg);
      color: var(--text-primary);
      // 活跃标签底部无边线（视觉上与内容区融合）
      border-bottom: 2px solid var(--accent);

      .terminal-tabs__close {
        opacity: 1;
      }
    }
  }

  &__type-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  // 内联重命名输入框
  &__rename-input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
    padding: 1px 4px;
    outline: none;
  }

  &__rec-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: var(--error, #ef4444);
    flex-shrink: 0;
    animation: rec-blink 1.2s ease-in-out infinite;

    @keyframes rec-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  }

  &__pin {
    color: var(--accent);
    flex-shrink: 0;
  }

  &__close {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    opacity: 0;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--error);
    }
  }

  // ===== 新建标签按钮 =====
  &__new-btn {
    width: 36px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-left: 1px solid var(--divider);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }
}
</style>
